create table public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.chart_snapshots(id),
  job_id uuid not null unique references public.pipeline_jobs(id),
  formula_version text not null,
  rule_version text not null,
  inputs jsonb not null,
  summary jsonb not null,
  created_at timestamptz not null default now()
);
create table public.chart_metrics (
  run_id uuid not null references public.analysis_runs(id),
  entry_id uuid not null references public.chart_entries(id),
  song_id uuid not null references public.songs(id),
  metrics jsonb not null,
  primary key(run_id,entry_id)
);
create table public.daily_briefs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.analysis_runs(id),
  snapshot_id uuid not null references public.chart_snapshots(id),
  body_mn text not null,
  facts jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.signals add column analysis_run_id uuid references public.analysis_runs(id);
alter table public.story_leads add column revision integer not null default 1;
alter table public.story_leads add column approved_draft_id uuid;
create table public.editorial_drafts (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.story_leads(id),
  author_id uuid not null references public.profiles(id),
  headline_mn text not null check(length(trim(headline_mn)) between 1 and 240),
  body_mn text not null check(length(body_mn)<=100000),
  headline_en text check(length(headline_en)<=240),
  body_en text check(length(body_en)<=100000),
  created_at timestamptz not null default now()
);
alter table public.story_leads add constraint approved_draft_fk foreign key(approved_draft_id) references public.editorial_drafts(id);
create table public.publications (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.story_leads(id),
  draft_id uuid not null references public.editorial_drafts(id),
  headline_mn text not null,
  body_mn text not null,
  headline_en text,
  body_en text,
  author_id uuid not null references public.profiles(id),
  editor_id uuid not null references public.profiles(id),
  source_facts jsonb not null,
  channel text not null check(channel in ('atlas','external')),
  external_url text check(external_url ~ '^https?://[^[:space:]]+$' and length(external_url)<=2048),
  published_at timestamptz not null default now(),
  check(channel='atlas' or external_url is not null),
  unique(story_id,draft_id,channel)
);
create table public.methodology_configuration (
  code text primary key,
  parameters jsonb not null,
  created_at timestamptz not null default now()
);
insert into public.methodology_configuration(code,parameters) values('chart-metrics-v2','{"dailyWeight":0.30,"weeklyWeight":0.25,"positionWeight":0.20,"streakWeight":0.15,"peakWeight":0.10,"dailyCap":25,"weeklyCap":50,"streakCap":7,"jumpThreshold":20,"replacementThreshold":0.4}');
create view public.chart_facts with(security_invoker=true) as
select ce.id as entry_id,ce.snapshot_id,cs.chart_id,cs.snapshot_date,ce.platform_asset_id,
  coalesce(r.song_id,ce.song_id) as song_id,ce.song_id as collected_song_id,ce.rank,ce.raw_metadata,
  s.primary_artist_id as artist_id,s.locality,s.canonical_title as title,pa.platform_artist_name as artist
from public.chart_entries ce join public.chart_snapshots cs on cs.id=ce.snapshot_id
join public.platform_assets pa on pa.id=ce.platform_asset_id
left join public.recordings r on r.id=pa.recording_id
join public.songs s on s.id=coalesce(r.song_id,ce.song_id)
where cs.status='approved';
create view public.current_chart_metrics with(security_invoker=true) as
select m.*,r.snapshot_id,r.formula_version,r.rule_version,r.created_at
from public.chart_metrics m join public.analysis_runs r on r.id=m.run_id
where r.id=(select r2.id from public.analysis_runs r2 where r2.snapshot_id=r.snapshot_id order by r2.created_at desc,r2.id desc limit 1);

create function public.complete_analysis(p_job uuid,p_token uuid,p_version text,p_inputs jsonb,p_summary jsonb,p_metrics jsonb,p_signals jsonb,p_brief text) returns uuid
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
  insert into daily_briefs(run_id,snapshot_id,body_mn,facts) values(r,j.snapshot_id,p_brief,p_summary);
  insert into calculation_runs(snapshot_id,calculation_version,status,started_at,completed_at) values(j.snapshot_id,p_version||':'||r,'succeeded',now(),now());
  update pipeline_jobs set status='succeeded',completed_at=now(),lease_until=null where id=p_job;
  insert into audit_logs(action,entity_type,entity_id,after_data) values('analysis.completed','chart_snapshot',j.snapshot_id::text,jsonb_build_object('runId',r,'version',p_version));
  return r;
end $$;

create function public.save_story(p_id uuid,p_revision integer,p_action text,p_values jsonb default '{}'::jsonb) returns integer
language plpgsql security definer set search_path=public as $$
declare l story_leads; role user_role:=staff_role(); d editorial_drafts; next_status story_status; draft_id uuid; target uuid;
begin
  if role is null or role not in ('administrator','editor','writer') then raise exception 'forbidden'; end if;
  select * into l from story_leads where id=p_id for update;
  if not found then raise exception 'story not found'; end if;
  if l.revision<>p_revision then raise exception 'conflict: reload the latest revision'; end if;
  if role='writer' and (l.assigned_to is distinct from auth.uid() or p_action not in ('draft','submit')) then raise exception 'forbidden'; end if;
  next_status:=l.status;
  case p_action
    when 'verify' then
      if l.status not in ('detected','needs_verification') then raise exception 'invalid transition'; end if;
      next_status:='verified';
    when 'assign' then
      if l.status not in ('verified','assigned','drafting','editing') then raise exception 'invalid transition'; end if;
      target:=(p_values->>'assignee')::uuid;
      if not exists(select 1 from profiles where id=target and active and role in ('writer','editor','administrator')) then raise exception 'invalid assignee'; end if;
      update story_leads set assigned_to=target,editor_id=auth.uid(),deadline=nullif(p_values->>'deadline','')::timestamptz where id=p_id;
      next_status:='assigned';
    when 'draft' then
      if l.status not in ('assigned','drafting','editing') then raise exception 'invalid transition'; end if;
      insert into editorial_drafts(story_id,author_id,headline_mn,body_mn,headline_en,body_en) values(p_id,auth.uid(),trim(p_values->>'headlineMn'),p_values->>'bodyMn',nullif(trim(p_values->>'headlineEn'),''),nullif(p_values->>'bodyEn','')) returning id into draft_id;
      next_status:='drafting';
    when 'submit' then
      if l.status<>'drafting' or not exists(select 1 from editorial_drafts where story_id=p_id and length(trim(body_mn))>0) then raise exception 'draft required'; end if;
      next_status:='editing';
    when 'approve' then
      if l.status<>'editing' then raise exception 'invalid transition'; end if;
      select * into d from editorial_drafts where story_id=p_id order by created_at desc,id desc limit 1;
      if d.id is null or length(trim(d.body_mn))=0 or ((d.headline_en is null)<>(d.body_en is null)) then raise exception 'complete draft required'; end if;
      update story_leads set approved_draft_id=d.id,editor_id=auth.uid() where id=p_id;
      next_status:='approved';
    when 'publish' then
      if l.status not in ('approved','published') or l.approved_draft_id is null then raise exception 'approval required'; end if;
      select * into d from editorial_drafts where id=l.approved_draft_id and story_id=p_id;
      insert into publications(story_id,draft_id,headline_mn,body_mn,headline_en,body_en,author_id,editor_id,source_facts,channel,external_url)
      values(p_id,d.id,d.headline_mn,d.body_mn,d.headline_en,d.body_en,d.author_id,auth.uid(),l.supporting_facts,coalesce(p_values->>'channel','atlas'),nullif(p_values->>'url',''));
      next_status:='published';
    when 'archive' then
      if l.status<>'published' then raise exception 'invalid transition'; end if;
      next_status:='archived';
    when 'dismiss' then
      if l.status in ('published','archived') or length(trim(coalesce(p_values->>'reason','')))<10 then raise exception 'dismissal reason required'; end if;
      next_status:='dismissed';
    else raise exception 'unknown action';
  end case;
  update story_leads set status=next_status,revision=revision+1,updated_at=now() where id=p_id;
  insert into audit_logs(actor_user_id,actor_type,action,entity_type,entity_id,before_data,after_data,reason)
  values(auth.uid(),'user','story.'||p_action,'story_lead',p_id::text,to_jsonb(l),jsonb_build_object('status',next_status,'revision',l.revision+1,'draftId',draft_id),p_values->>'reason');
  return l.revision+1;
end $$;

create function public.review_intelligence(p_kind text,p_id uuid,p_status text,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare role user_role:=staff_role(); old_data jsonb;
begin
  if role is null or role not in ('administrator','data_editor','editor') then raise exception 'forbidden'; end if;
  if length(trim(coalesce(p_reason,''))) not between 10 and 2000 then raise exception 'reason required'; end if;
  if p_kind='signal' then
    if p_status not in ('under_review','confirmed','dismissed') then raise exception 'invalid status'; end if;
    select to_jsonb(s) into old_data from signals s where id=p_id for update;
    update signals set status=p_status::signal_status where id=p_id;
  elsif p_kind='anomaly' then
    if p_status not in ('reviewing','confirmed_event','data_error','dismissed','resolved') then raise exception 'invalid status'; end if;
    select to_jsonb(a) into old_data from anomaly_alerts a where id=p_id for update;
    update anomaly_alerts set status=p_status::anomaly_status,resolved_at=case when p_status in ('resolved','dismissed') then now() end where id=p_id;
    insert into anomaly_reviews(anomaly_id,reviewer_id,resolution,notes) values(p_id,auth.uid(),p_status::anomaly_status,p_reason);
  else raise exception 'invalid review kind'; end if;
  if old_data is null then raise exception 'record not found'; end if;
  insert into audit_logs(actor_user_id,actor_type,action,entity_type,entity_id,before_data,after_data,reason) values(auth.uid(),'user',p_kind||'.reviewed',p_kind,p_id::text,old_data,jsonb_build_object('status',p_status),p_reason);
end $$;

do $$ declare t text; begin
  foreach t in array array['analysis_runs','chart_metrics','daily_briefs','editorial_drafts','publications','methodology_configuration'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create trigger immutable before update or delete on public.%I for each row execute function public.prevent_mutation()',t);
    execute format('create policy staff_read on public.%I for select to authenticated using (public.staff_role() is not null)',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
create policy public_analysis on public.analysis_runs for select to anon,authenticated using(exists(select 1 from public.chart_snapshots where id=snapshot_id and status='approved'));
create policy public_metrics on public.chart_metrics for select to anon,authenticated using(exists(select 1 from public.analysis_runs r join public.chart_snapshots s on s.id=r.snapshot_id where r.id=run_id and s.status='approved'));
create policy public_publications on public.publications for select to anon,authenticated using(true);
create policy public_configuration on public.methodology_configuration for select to anon,authenticated using(true);
grant select on public.analysis_runs,public.chart_metrics,public.publications,public.methodology_configuration,public.chart_facts,public.current_chart_metrics to anon,authenticated;
create policy staff_directory on public.profiles for select to authenticated using(public.staff_role() is not null);
revoke all on function public.complete_analysis(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.complete_analysis(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,text) to service_role;
revoke all on function public.save_story(uuid,integer,text,jsonb),public.review_intelligence(text,uuid,text,text) from public,anon;
grant execute on function public.save_story(uuid,integer,text,jsonb),public.review_intelligence(text,uuid,text,text) to authenticated;
