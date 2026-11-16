alter table public.attempt_reviews add column checksum text;
create or replace function public.enqueue_collection(p_date date, p_revision_of uuid default null, p_reason text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare j uuid; c uuid; k text; existing_snapshot uuid;
begin
  if p_date > (now() at time zone 'Asia/Ulaanbaatar')::date then raise exception 'future collection date'; end if;
  if p_date <> (now() at time zone 'Asia/Ulaanbaatar')::date then raise exception 'live collection cannot backfill history'; end if;
  if p_revision_of is not null and not exists(select 1 from chart_snapshots where id=p_revision_of and snapshot_date=p_date and status='approved') then raise exception 'invalid revision target'; end if;
  k := 'apple_music:mn:'||p_date||coalesce(':revision:'||p_revision_of,'');
  if p_revision_of is null then
    select id into existing_snapshot from chart_snapshots where snapshot_date=p_date and chart_id='00000000-0000-0000-0000-000000000010' and status='approved';
    if found then
      insert into pipeline_jobs(kind,business_date,snapshot_id,idempotency_key,status,completed_at) values('collect',p_date,existing_snapshot,k,'succeeded',now()) on conflict(idempotency_key) do update set status='succeeded',snapshot_id=excluded.snapshot_id,completed_at=now(),lease_until=null returning id into j;
      if not exists(select 1 from analysis_runs where snapshot_id=existing_snapshot) then
        insert into pipeline_jobs(kind,business_date,snapshot_id,idempotency_key) values('calculate',p_date,existing_snapshot,'calculate:'||existing_snapshot||':initial') on conflict do nothing;
      end if;
      return j;
    end if;
  end if;
  insert into collection_jobs(chart_id,idempotency_key,scheduled_for) values('00000000-0000-0000-0000-000000000010',k,now()) on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into c;
  insert into pipeline_jobs(kind,business_date,collection_job_id,revision_of,idempotency_key,reason) values('collect',p_date,c,p_revision_of,k,p_reason) on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into j;
  return j;
end $$;

create or replace function public.review_pipeline_job(p_job uuid,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if staff_role() is null or staff_role() not in ('administrator','data_editor') then raise exception 'forbidden'; end if;
  if length(trim(p_reason)) not between 10 and 2000 then raise exception 'review reason required'; end if;
  perform 1 from pipeline_jobs where id=p_job and status in ('failed','review') and error_code is distinct from 'missed_date' for update;
  if not found then raise exception 'job is not reviewable'; end if;
  insert into attempt_reviews(job_id,reviewer_id,reason,checksum) values(p_job,auth.uid(),p_reason,(select checksum from collection_attempts where job_id=p_job order by received_at desc limit 1));
  update pipeline_jobs set status='queued',attempts=0,available_at=now(),error_code=null,completed_at=null where id=p_job;
  -- attempt numbers remain unique across review cycles via lease tokens in the worker.
  insert into audit_logs(actor_user_id,actor_type,action,entity_type,entity_id,reason) values(auth.uid(),'user','collection.reviewed','pipeline_job',p_job::text,p_reason);
end $$;
