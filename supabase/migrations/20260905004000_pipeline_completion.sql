create or replace function public.enqueue_collection(p_date date, p_revision_of uuid default null, p_reason text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare j uuid; c uuid; k text;
begin
  if p_date > (now() at time zone 'Asia/Ulaanbaatar')::date then raise exception 'future collection date'; end if;
  if p_date <> (now() at time zone 'Asia/Ulaanbaatar')::date then raise exception 'live collection cannot backfill history'; end if;
  if p_revision_of is not null and not exists(select 1 from chart_snapshots where id=p_revision_of and snapshot_date=p_date and status='approved') then raise exception 'invalid revision target'; end if;
  k := 'apple_music:mn:'||p_date||coalesce(':revision:'||p_revision_of,'');
  insert into collection_jobs(chart_id,idempotency_key,scheduled_for) values('00000000-0000-0000-0000-000000000010',k,now()) on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into c;
  insert into pipeline_jobs(kind,business_date,collection_job_id,revision_of,idempotency_key,reason) values('collect',p_date,c,p_revision_of,k,p_reason) on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into j;
  return j;
end $$;

create or replace function public.complete_collection(p_job uuid,p_token uuid,p_attempt uuid,p_payload jsonb,p_entries jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare j pipeline_jobs; a collection_attempts; s uuid;
begin
  select * into j from pipeline_jobs where id=p_job and lease_token=p_token and lease_until>now() and status='running' and kind='collect' for update;
  if not found then raise exception 'lost job lease'; end if;
  select * into a from collection_attempts where id=p_attempt and job_id=p_job and lease_token=p_token;
  if not found or a.http_status is distinct from 200 then raise exception 'missing source evidence'; end if;
  if j.revision_of is not null then
    perform set_config('atlas.revision','on',true);
    update chart_snapshots set status='replaced' where id=j.revision_of and status='approved';
    if not found then raise exception 'revision target changed'; end if;
  end if;
  s:=ingest_apple_music_snapshot(j.collection_job_id,j.business_date,null,a.checksum,a.source_url,p_payload,p_entries);
  if j.revision_of is not null then perform enqueue_reprocessing(j.business_date,j.reason); end if;
  -- revision_of must be assigned while the snapshot is a candidate (handled by ingestion).
  update pipeline_jobs set status='succeeded',snapshot_id=s,completed_at=now(),lease_until=null where id=p_job;
  insert into pipeline_jobs(kind,business_date,snapshot_id,idempotency_key) values('calculate',j.business_date,s,'calculate:'||s||':initial') on conflict do nothing;
  return s;
end $$;

create or replace function public.complete_analysis(p_job uuid,p_token uuid,p_version text,p_inputs jsonb,p_summary jsonb,p_metrics jsonb,p_signals jsonb,p_brief text) returns uuid
language plpgsql security definer set search_path=public as $$
declare j pipeline_jobs; r uuid; e jsonb; sig uuid;
begin
  select * into j from pipeline_jobs where id=p_job and lease_token=p_token and status='running' and lease_until>now() and kind='calculate' for update;
  if not found then raise exception 'lost job lease'; end if;
  if not exists(select 1 from chart_snapshots where id=j.snapshot_id and status='approved') then raise exception 'snapshot no longer approved'; end if;
  if jsonb_array_length(p_metrics)<>100 then raise exception 'expected complete metric set'; end if;
  insert into analysis_runs(snapshot_id,job_id,formula_version,rule_version,inputs,summary) values(j.snapshot_id,j.id,p_version,'signals-v2',p_inputs,p_summary) returning id into r;
  for e in select value from jsonb_array_elements(p_metrics) loop
    if not exists(select 1 from chart_entries where id=(e->>'entryId')::uuid and snapshot_id=j.snapshot_id) then raise exception 'metric evidence mismatch'; end if;
    insert into chart_metrics(run_id,entry_id,song_id,metrics) values(r,(e->>'entryId')::uuid,(e->>'songId')::uuid,e);
  end loop;
  for e in select value from jsonb_array_elements(p_signals) loop
    insert into signals(signal_type,song_id,artist_id,chart_id,snapshot_id,severity,confidence,headline_summary,rule_version,analysis_run_id)
    values(e->>'type',(e->>'songId')::uuid,(e->>'artistId')::uuid,'00000000-0000-0000-0000-000000000010',j.snapshot_id,(e->>'severity')::severity,1,e->>'headline','signals-v2',r) returning id into sig;
    insert into signal_evidence(signal_id,chart_entry_id,evidence_type,payload) values(sig,(e->>'entryId')::uuid,'calculation',e||jsonb_build_object('runId',r,'inputs',p_inputs));
    -- Preserve reviewed leads on reprocessing; only genuinely new angles enter the queue.
    if not exists(select 1 from story_leads l join signals s on s.id=l.signal_id where s.snapshot_id=j.snapshot_id and s.song_id=(e->>'songId')::uuid and s.signal_type=e->>'type')
       and (select count(*) from story_leads l join signals s on s.id=l.signal_id where s.analysis_run_id=r)<10 then
      insert into story_leads(signal_id,headline,angle,supporting_facts,priority,confidence)
      values(sig,e->>'headline',e->>'explanation',jsonb_build_array(e||jsonb_build_object('signalId',sig,'runId',r)),case when e->>'severity'='high' then 'high' else 'normal' end,1);
    end if;
  end loop;
  if coalesce((p_summary->>'massReplacement')::boolean,false) then
    insert into anomaly_alerts(chart_id,snapshot_id,anomaly_type,severity,summary,evidence) values('00000000-0000-0000-0000-000000000010',j.snapshot_id,'mass_chart_replacement','high','Chart replacement exceeds the configured threshold.',p_summary||jsonb_build_object('runId',r));
  end if;
  insert into daily_briefs(run_id,snapshot_id,body_mn,facts) values(r,j.snapshot_id,p_brief,p_summary);
  insert into calculation_runs(snapshot_id,calculation_version,status,started_at,completed_at) values(j.snapshot_id,p_version||':'||r,'succeeded',now(),now());
  update pipeline_jobs set status='succeeded',completed_at=now(),lease_until=null where id=p_job;
  insert into audit_logs(action,entity_type,entity_id,after_data) values('analysis.completed','chart_snapshot',j.snapshot_id::text,jsonb_build_object('runId',r,'version',p_version));
  return r;
end $$;

create or replace function public.catalog_operation(p_action text,p_source uuid,p_target uuid,p_recordings uuid[],p_reason text,p_preview boolean default true,p_fingerprint text default null) returns jsonb
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
  select jsonb_build_object('source',to_jsonb(s),'target',to_jsonb(t),'targetCredits',(select coalesce(jsonb_agg(to_jsonb(c) order by c.artist_id,c.credit_role),'[]'::jsonb) from song_artists c where c.song_id=t.id),'recordings',(select jsonb_agg(to_jsonb(r) order by r.id) from recordings r where id=any(records))) into before_state from songs s,songs t where s.id=p_source and t.id=p_target;
  select min(f.snapshot_date) into d from chart_facts f join platform_assets pa on pa.id=f.platform_asset_id where pa.recording_id=any(records);
  result:=jsonb_build_object('fingerprint',md5(before_state::text),'recordings',cardinality(records),'entries',(select count(*) from chart_entries ce join platform_assets pa on pa.id=ce.platform_asset_id where pa.recording_id=any(records)),'signals',(select count(*) from signals where song_id in(p_source,p_target)),'firstAffectedDate',d,'source',p_source,'target',p_target);
  if p_preview then return result; end if;
  if p_fingerprint is distinct from md5(before_state::text) then raise exception 'conflict: preview again'; end if;
  if length(trim(coalesce(p_reason,''))) not between 10 and 2000 then raise exception 'reason required'; end if;
  update recordings set song_id=p_target where id=any(records);
  if p_action='merge' then update songs set redirect_to=p_target,updated_at=now() where id=p_source; end if;
  insert into song_artists(song_id,artist_id,credit_role,credit_order) select p_target,artist_id,credit_role,credit_order from song_artists where song_id=p_source on conflict do nothing;
  select jsonb_build_object('source',to_jsonb(s),'target',to_jsonb(t),'targetCredits',(select coalesce(jsonb_agg(to_jsonb(c) order by c.artist_id,c.credit_role),'[]'::jsonb) from song_artists c where c.song_id=t.id),'recordings',(select jsonb_agg(to_jsonb(r) order by r.id) from recordings r where id=any(records))) into after_state from songs s,songs t where s.id=p_source and t.id=p_target;
  insert into catalog_operations(action,source_id,target_id,before_data,after_data,actor_id,reason) values(p_action,p_source,p_target,before_state,after_state,auth.uid(),p_reason) returning id into op;
  insert into audit_logs(actor_user_id,actor_type,action,entity_type,entity_id,before_data,after_data,reason) values(auth.uid(),'user','catalog.'||p_action,'song',p_source::text,before_state,after_state,p_reason);
  perform enqueue_reprocessing(d,p_reason);
  return result||jsonb_build_object('operationId',op);
end $$;

create or replace function public.undo_catalog_operation(p_operation uuid,p_reason text) returns void
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
  select jsonb_build_object('source',to_jsonb(s),'target',to_jsonb(t),'targetCredits',(select coalesce(jsonb_agg(to_jsonb(c) order by c.artist_id,c.credit_role),'[]'::jsonb) from song_artists c where c.song_id=t.id),'recordings',(select jsonb_agg(to_jsonb(r) order by r.id) from recordings r where id=any(records))) into actual from songs s,songs t where s.id=o.source_id and t.id=o.target_id;
  if actual is distinct from o.after_data then raise exception 'conflict: catalog changed since operation'; end if;
  delete from song_artists where song_id=o.target_id;
  insert into song_artists(song_id,artist_id,credit_role,credit_order) select (c->>'song_id')::uuid,(c->>'artist_id')::uuid,c->>'credit_role',(c->>'credit_order')::integer from jsonb_array_elements(o.before_data->'targetCredits') c;
  update recordings set song_id=o.source_id where id=any(records);
  update songs set redirect_to=null,updated_at=now() where id=o.source_id;
  insert into catalog_operations(action,source_id,target_id,before_data,after_data,actor_id,reason) values('undo',o.source_id,o.target_id,o.after_data,o.before_data,auth.uid(),p_reason);
  insert into audit_logs(actor_user_id,actor_type,action,entity_type,entity_id,reason) values(auth.uid(),'user','catalog.undo','catalog_operation',p_operation::text,p_reason);
  perform enqueue_reprocessing((select min(snapshot_date) from chart_facts where song_id in(o.source_id,o.target_id)),p_reason);
end $$;
