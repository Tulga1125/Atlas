alter table public.songs add column redirect_to uuid references public.songs(id);
alter table public.songs add constraint no_self_redirect check(redirect_to is distinct from id);
create table public.song_aliases (
  id uuid primary key default gen_random_uuid(),song_id uuid not null references public.songs(id),
  alias text not null check(length(trim(alias)) between 1 and 240),
  unique(song_id,alias)
);
create table public.catalog_operations (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  source_id uuid not null references public.songs(id),
  target_id uuid references public.songs(id),
  before_data jsonb not null,
  after_data jsonb not null,
  actor_id uuid not null references public.profiles(id),
  reason text not null,
  created_at timestamptz not null default now()
);
create trigger catalog_operations_immutable before update or delete on public.catalog_operations for each row execute function public.prevent_mutation();
alter table public.catalog_operations enable row level security;
create policy staff_read on public.catalog_operations for select to authenticated using(public.staff_role() is not null);
grant select on public.catalog_operations to authenticated;
alter table public.song_aliases enable row level security;
create policy public_read on public.song_aliases for select using(true);
grant select on public.song_aliases to anon,authenticated;

create function public.enqueue_reprocessing(p_from date,p_reason text) returns integer
language plpgsql security definer set search_path=public as $$
declare n integer; batch uuid:=gen_random_uuid();
begin
  insert into pipeline_jobs(kind,business_date,snapshot_id,idempotency_key,requested_by,reason,available_at)
  select 'calculate',snapshot_date,id,'reprocess:'||batch||':'||id,auth.uid(),p_reason,now()+make_interval(secs=>row_number() over(order by snapshot_date)::integer)
  from chart_snapshots where status='approved' and snapshot_date>=p_from;
  get diagnostics n=row_count;
  return n;
end $$;
create function public.request_reprocessing(p_snapshot uuid,p_reason text) returns integer
language plpgsql security definer set search_path=public as $$
declare d date; n integer;
begin
  if staff_role() is distinct from 'administrator' then raise exception 'forbidden'; end if;
  if length(trim(coalesce(p_reason,''))) not between 10 and 2000 then raise exception 'reason required'; end if;
  select snapshot_date into d from chart_snapshots where id=p_snapshot and status='approved';
  if not found then raise exception 'snapshot not found'; end if;
  n:=enqueue_reprocessing(d,p_reason);
  insert into audit_logs(actor_user_id,actor_type,action,entity_type,entity_id,reason) values(auth.uid(),'user','snapshot.reprocess_requested','chart_snapshot',p_snapshot::text,p_reason);
  return n;
end $$;
create function public.request_collection_revision(p_snapshot uuid,p_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare d date; j uuid;
begin
  if staff_role() is distinct from 'administrator' then raise exception 'forbidden'; end if;
  if length(trim(coalesce(p_reason,''))) not between 10 and 2000 then raise exception 'reason required'; end if;
  select snapshot_date into d from chart_snapshots where id=p_snapshot and status='approved';
  if d is distinct from (now() at time zone 'Asia/Ulaanbaatar')::date then raise exception 'live source cannot revise a past date'; end if;
  j:=enqueue_collection(d,p_snapshot,p_reason);
  update pipeline_jobs set requested_by=auth.uid() where id=j;
  insert into audit_logs(actor_user_id,actor_type,action,entity_type,entity_id,reason) values(auth.uid(),'user','snapshot.revision_requested','chart_snapshot',p_snapshot::text,p_reason);
  return j;
end $$;

create function public.review_song(p_song uuid,p_title text,p_language text,p_genre text,p_locality public.locality,p_alias text,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare old_data jsonb;
begin
  if staff_role() is null or staff_role() not in ('administrator','data_editor') then raise exception 'forbidden'; end if;
  if length(trim(coalesce(p_title,''))) not between 1 and 240 or length(trim(coalesce(p_reason,''))) not between 10 and 2000 or length(coalesce(p_language,''))>80 or length(coalesce(p_genre,''))>120 then raise exception 'invalid metadata or reason'; end if;
  select to_jsonb(s) into old_data from songs s where id=p_song and redirect_to is null for update;
  if not found then raise exception 'song not found'; end if;
  update songs set canonical_title=trim(p_title),normalized_title=normalize_catalog_text(p_title),language=nullif(trim(p_language),''),genre=nullif(trim(p_genre),''),locality=p_locality,verification='verified',updated_at=now() where id=p_song;
  if nullif(trim(p_alias),'') is not null then insert into song_aliases(song_id,alias) values(p_song,trim(p_alias)) on conflict do nothing; end if;
  update entity_match_reviews set status='linked',reviewed_by=auth.uid(),reviewed_at=now() where status='open' and platform_asset_id in(select pa.id from platform_assets pa join recordings r on r.id=pa.recording_id where r.song_id=p_song);
  insert into audit_logs(actor_user_id,actor_type,action,entity_type,entity_id,before_data,after_data,reason) select auth.uid(),'user','song.reviewed','song',p_song::text,old_data,to_jsonb(s),p_reason from songs s where id=p_song;
  perform enqueue_reprocessing((select min(snapshot_date) from chart_facts where song_id=p_song),p_reason);
end $$;

create function public.catalog_operation(p_action text,p_source uuid,p_target uuid,p_recordings uuid[],p_reason text,p_preview boolean default true,p_fingerprint text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare before_state jsonb; after_state jsonb; result jsonb; records uuid[]; op uuid; d date;
begin
  if staff_role() is distinct from 'administrator' then raise exception 'forbidden'; end if;
  if p_action not in ('merge','split') or p_source=p_target then raise exception 'invalid operation'; end if;
  perform 1 from songs where id in(p_source,p_target) order by id for update;
  if (select count(*) from songs where id in(p_source,p_target) and redirect_to is null)<>2 then raise exception 'choose two active canonical songs'; end if;
  select array_agg(id order by id) into records from recordings where song_id=p_source and (p_action='merge' or id=any(p_recordings));
  if coalesce(cardinality(records),0)=0 then raise exception 'no recordings selected'; end if;
  if p_action='split' and (cardinality(records)<>cardinality(p_recordings) or cardinality(records)=(select count(*) from recordings where song_id=p_source)) then raise exception 'split must move a proper subset of source recordings'; end if;
  perform 1 from recordings where id=any(records) order by id for update;
  select jsonb_build_object('source',to_jsonb(s),'target',to_jsonb(t),'recordings',(select jsonb_agg(to_jsonb(r) order by r.id) from recordings r where id=any(records))) into before_state from songs s,songs t where s.id=p_source and t.id=p_target;
  select min(f.snapshot_date) into d from chart_facts f join platform_assets pa on pa.id=f.platform_asset_id where pa.recording_id=any(records);
  result:=jsonb_build_object('fingerprint',md5(before_state::text),'recordings',cardinality(records),'entries',(select count(*) from chart_entries ce join platform_assets pa on pa.id=ce.platform_asset_id where pa.recording_id=any(records)),'signals',(select count(*) from signals where song_id in(p_source,p_target)),'firstAffectedDate',d,'source',p_source,'target',p_target);
  if p_preview then return result; end if;
  if p_fingerprint is distinct from md5(before_state::text) then raise exception 'conflict: preview again'; end if;
  if length(trim(coalesce(p_reason,''))) not between 10 and 2000 then raise exception 'reason required'; end if;
  update recordings set song_id=p_target where id=any(records);
  if p_action='merge' then update songs set redirect_to=p_target,updated_at=now() where id=p_source; end if;
  insert into song_artists(song_id,artist_id,credit_role,credit_order) select p_target,artist_id,credit_role,credit_order from song_artists where song_id=p_source on conflict do nothing;
  select jsonb_build_object('source',to_jsonb(s),'target',to_jsonb(t),'recordings',(select jsonb_agg(to_jsonb(r) order by r.id) from recordings r where id=any(records))) into after_state from songs s,songs t where s.id=p_source and t.id=p_target;
  insert into catalog_operations(action,source_id,target_id,before_data,after_data,actor_id,reason) values(p_action,p_source,p_target,before_state,after_state,auth.uid(),p_reason) returning id into op;
  insert into audit_logs(actor_user_id,actor_type,action,entity_type,entity_id,before_data,after_data,reason) values(auth.uid(),'user','catalog.'||p_action,'song',p_source::text,before_state,after_state,p_reason);
  perform enqueue_reprocessing(d,p_reason);
  return result||jsonb_build_object('operationId',op);
end $$;

create function public.undo_catalog_operation(p_operation uuid,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare o catalog_operations; actual jsonb; records uuid[];
begin
  if staff_role() is distinct from 'administrator' then raise exception 'forbidden'; end if;
  if length(trim(coalesce(p_reason,''))) not between 10 and 2000 then raise exception 'reason required'; end if;
  select * into o from catalog_operations where id=p_operation;
  if not found or o.action not in ('merge','split') then raise exception 'operation not found'; end if;
  select array_agg((e->>'id')::uuid) into records from jsonb_array_elements(o.before_data->'recordings') e;
  perform 1 from songs where id in(o.source_id,o.target_id) order by id for update;
  perform 1 from recordings where id=any(records) order by id for update;
  select jsonb_build_object('source',to_jsonb(s),'target',to_jsonb(t),'recordings',(select jsonb_agg(to_jsonb(r) order by r.id) from recordings r where id=any(records))) into actual from songs s,songs t where s.id=o.source_id and t.id=o.target_id;
  if actual is distinct from o.after_data then raise exception 'conflict: catalog changed since operation'; end if;
  update recordings set song_id=o.source_id where id=any(records);
  update songs set redirect_to=null,updated_at=now() where id=o.source_id;
  insert into catalog_operations(action,source_id,target_id,before_data,after_data,actor_id,reason) values('undo',o.source_id,o.target_id,o.after_data,o.before_data,auth.uid(),p_reason);
  insert into audit_logs(actor_user_id,actor_type,action,entity_type,entity_id,reason) values(auth.uid(),'user','catalog.undo','catalog_operation',p_operation::text,p_reason);
  perform enqueue_reprocessing((select min(snapshot_date) from chart_facts where song_id in(o.source_id,o.target_id)),p_reason);
end $$;
revoke all on function public.enqueue_reprocessing(date,text) from public,anon,authenticated;
grant execute on function public.enqueue_reprocessing(date,text) to service_role;
revoke all on function public.request_reprocessing(uuid,text),public.request_collection_revision(uuid,text),public.review_song(uuid,text,text,text,public.locality,text,text),public.catalog_operation(text,uuid,uuid,uuid[],text,boolean,text),public.undo_catalog_operation(uuid,text) from public,anon;
grant execute on function public.request_reprocessing(uuid,text),public.request_collection_revision(uuid,text),public.review_song(uuid,text,text,text,public.locality,text,text),public.catalog_operation(text,uuid,uuid,uuid[],text,boolean,text),public.undo_catalog_operation(uuid,text) to authenticated;
