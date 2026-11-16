-- Operational state is mutable; attempt evidence and source history are append-only.
create function public.staff_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and active
$$;
revoke all on function public.staff_role() from public;
grant execute on function public.staff_role() to authenticated, service_role;

create table public.pipeline_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('collect','calculate','artists')),
  business_date date not null,
  snapshot_id uuid references public.chart_snapshots(id),
  revision_of uuid references public.chart_snapshots(id),
  collection_job_id uuid references public.collection_jobs(id),
  idempotency_key text not null unique,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','review','cancelled')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  error_code text,
  error_message text,
  requested_by uuid references public.profiles(id),
  reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index pipeline_jobs_ready on public.pipeline_jobs(available_at,created_at) where status in ('queued','running');
create table public.collection_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.pipeline_jobs(id),
  attempt_number integer not null,
  lease_token uuid not null,
  source_url text not null,
  http_status integer,
  raw_body text,
  checksum text,
  received_at timestamptz not null default now(),
  error_code text,
  unique(job_id,attempt_number)
);
create trigger collection_attempts_immutable before update or delete on public.collection_attempts for each row execute function public.prevent_mutation();

create table public.attempt_reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.pipeline_jobs(id),
  reviewer_id uuid not null references public.profiles(id),
  reason text not null check(length(trim(reason)) between 10 and 2000),
  created_at timestamptz not null default now()
);
create trigger attempt_reviews_immutable before update or delete on public.attempt_reviews for each row execute function public.prevent_mutation();

create function public.enqueue_collection(p_date date, p_revision_of uuid default null, p_reason text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare j uuid; c uuid; k text;
begin
  if p_date > (now() at time zone 'Asia/Ulaanbaatar')::date then raise exception 'future collection date'; end if;
  if p_revision_of is null and p_date <> (now() at time zone 'Asia/Ulaanbaatar')::date then raise exception 'live collection cannot backfill history'; end if;
  if p_revision_of is not null and not exists(select 1 from chart_snapshots where id=p_revision_of and snapshot_date=p_date and status='approved') then raise exception 'invalid revision target'; end if;
  k := 'apple_music:mn:'||p_date||coalesce(':revision:'||p_revision_of,'');
  insert into collection_jobs(chart_id,idempotency_key,scheduled_for) values('00000000-0000-0000-0000-000000000010',k,now()) on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into c;
  insert into pipeline_jobs(kind,business_date,collection_job_id,revision_of,idempotency_key,reason) values('collect',p_date,c,p_revision_of,k,p_reason) on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into j;
  return j;
end $$;

create function public.claim_pipeline_job() returns setof public.pipeline_jobs
language plpgsql security definer set search_path = public as $$
declare j pipeline_jobs;
begin
  -- Expired workers cannot leave jobs running forever, including their final attempt.
  update pipeline_jobs set status='failed',error_code='lease_exhausted',completed_at=now() where status='running' and lease_until<now() and attempts>=5;
  select * into j from pipeline_jobs where attempts<5 and ((status='queued' and available_at<=now()) or (status='running' and lease_until<now())) order by available_at,created_at for update skip locked limit 1;
  if not found then return; end if;
  return query update pipeline_jobs set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds' where id=j.id returning *;
end $$;

create function public.finish_pipeline_failure(p_job uuid,p_token uuid,p_code text,p_message text,p_retry_seconds integer default null,p_review boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare j pipeline_jobs;
begin
  select * into j from pipeline_jobs where id=p_job and lease_token=p_token and status='running' for update;
  if not found then raise exception 'lost job lease'; end if;
  update pipeline_jobs set status=case when p_review then 'review' when p_retry_seconds is not null and attempts<5 then 'queued' else 'failed' end,
    available_at=now()+make_interval(secs=>greatest(coalesce(p_retry_seconds,0),0)),error_code=left(p_code,100),error_message=left(p_message,1000),lease_until=null,completed_at=case when p_retry_seconds is null then now() end where id=p_job;
  update collection_jobs set status=case when p_review then 'rejected'::job_status else 'failed'::job_status end,error_code=p_code,error_message=left(p_message,1000),completed_at=now() where id=j.collection_job_id;
  if p_review or p_retry_seconds is null or j.attempts>=5 then
    insert into anomaly_alerts(chart_id,anomaly_type,severity,summary,evidence) values('00000000-0000-0000-0000-000000000010',p_code,'critical',left(p_message,1000),jsonb_build_object('jobId',p_job,'businessDate',j.business_date));
  end if;
end $$;

create or replace function public.prevent_approved_entry_mutation() returns trigger
language plpgsql as $$
begin
  if (tg_op <> 'INSERT' and exists(select 1 from public.chart_snapshots where id=old.snapshot_id and status in ('approved','replaced')))
     or (tg_op <> 'DELETE' and exists(select 1 from public.chart_snapshots where id=new.snapshot_id and status in ('approved','replaced'))) then
    raise exception 'entries belonging to an approved snapshot are immutable';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
drop trigger chart_entries_approved_immutable on public.chart_entries;
create trigger chart_entries_approved_immutable before insert or update or delete on public.chart_entries for each row execute function public.prevent_approved_entry_mutation();
create function public.protect_snapshot() returns trigger language plpgsql as $$
begin
  if tg_op='INSERT' and new.status in ('approved','replaced') then raise exception 'snapshots require candidate validation'; end if;
  if tg_op<>'INSERT' and old.status in ('approved','replaced') then
    if tg_op='UPDATE' and old.status='approved' and new.status='replaced' and current_setting('atlas.revision',true)='on' and (to_jsonb(old)-'status')=(to_jsonb(new)-'status') then return new; end if;
    raise exception 'approved snapshot headers are immutable';
  end if;
  if tg_op='UPDATE' and new.status='approved' and (not new.is_complete or (select count(*) from public.chart_entries where snapshot_id=new.id)<>100 or exists(select 1 from public.chart_entries where snapshot_id=new.id and rank not between 1 and 100)) then raise exception 'snapshot completeness check failed'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger snapshot_protection before insert or update or delete on public.chart_snapshots for each row execute function public.protect_snapshot();

create function public.complete_collection(p_job uuid,p_token uuid,p_attempt uuid,p_payload jsonb,p_entries jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare j pipeline_jobs; a collection_attempts; s uuid;
begin
  select * into j from pipeline_jobs where id=p_job and lease_token=p_token and lease_until>now() and status='running' and kind='collect' for update;
  if not found then raise exception 'lost job lease'; end if;
  select * into a from collection_attempts where id=p_attempt and job_id=p_job and lease_token=p_token;
  if not found or a.http_status<>200 then raise exception 'missing source evidence'; end if;
  if j.revision_of is not null then
    perform set_config('atlas.revision','on',true);
    update chart_snapshots set status='replaced' where id=j.revision_of and status='approved';
    if not found then raise exception 'revision target changed'; end if;
  end if;
  s:=ingest_apple_music_snapshot(j.collection_job_id,j.business_date,null,a.checksum,a.source_url,p_payload,p_entries);
  -- revision_of must be assigned while the snapshot is a candidate (handled by ingestion).
  update pipeline_jobs set status='succeeded',snapshot_id=s,completed_at=now(),lease_until=null where id=p_job;
  insert into pipeline_jobs(kind,business_date,snapshot_id,idempotency_key) values('calculate',j.business_date,s,'calculate:'||s||':initial') on conflict do nothing;
  return s;
end $$;

create function public.review_pipeline_job(p_job uuid,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if staff_role() is null or staff_role() not in ('administrator','data_editor') then raise exception 'forbidden'; end if;
  if length(trim(p_reason)) not between 10 and 2000 then raise exception 'review reason required'; end if;
  perform 1 from pipeline_jobs where id=p_job and status in ('failed','review') for update;
  if not found then raise exception 'job is not reviewable'; end if;
  insert into attempt_reviews(job_id,reviewer_id,reason) values(p_job,auth.uid(),p_reason);
  update pipeline_jobs set status='queued',attempts=0,available_at=now(),error_code=null,completed_at=null where id=p_job;
  -- attempt numbers remain unique across review cycles via lease tokens in the worker.
  insert into audit_logs(actor_user_id,actor_type,action,entity_type,entity_id,reason) values(auth.uid(),'user','collection.reviewed','pipeline_job',p_job::text,p_reason);
end $$;
-- Absolute evidence sequence is independent of retry budget reset.
alter table public.collection_attempts drop constraint collection_attempts_job_id_attempt_number_key;
create unique index collection_attempts_lease on public.collection_attempts(job_id,lease_token);

do $$ declare t text; begin
  foreach t in array array['pipeline_jobs','collection_attempts','attempt_reviews'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy staff_read on public.%I for select to authenticated using (public.staff_role() is not null)',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
grant select on public.raw_payloads,public.audit_logs to authenticated;
create policy staff_raw on public.raw_payloads for select to authenticated using(public.staff_role() is not null);
create policy staff_audit on public.audit_logs for select to authenticated using(public.staff_role() is not null);
revoke all on function public.enqueue_collection(date,uuid,text),public.claim_pipeline_job(),public.finish_pipeline_failure(uuid,uuid,text,text,integer,boolean),public.complete_collection(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_collection(date,uuid,text),public.claim_pipeline_job(),public.finish_pipeline_failure(uuid,uuid,text,text,integer,boolean),public.complete_collection(uuid,uuid,uuid,jsonb,jsonb) to service_role;
revoke all on function public.review_pipeline_job(uuid,text) from public,anon;
grant execute on function public.review_pipeline_job(uuid,text) to authenticated;
