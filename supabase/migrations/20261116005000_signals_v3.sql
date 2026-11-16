-- B2: the rest of the rule-based signal set (spec §9.1), signals-v3.
-- Thresholds are configuration; each signal keeps the rule version that
-- produced it, so dismissed and historical signals stay explainable.

insert into public.methodology_versions (code, title, notes, effective_from)
values ('signals-v3', 'Rule-based signals v3',
  'Adds threshold_crossing (first Top 50/40/20), fastest_climber (rise as a share of the previous rank), breakout, slow_burn, sudden_revival, artist_takeover, catalog_effect, international_release_wave (needs album metadata; skipped and recorded when missing), resilience and high_volatility. Consecutive days are consecutive approved chart dates; a missing day is never movement. Earlier signals keep signals-v2.',
  '2026-11-16') on conflict (code) do nothing;
insert into public.methodology_configuration (code, parameters)
values ('signals-v3', '{"thresholds":[50,40,20],"fastestMinRise":2,"breakoutMinGain":15,"breakoutStartOutside":40,"slowBurnWeeks":3,"slowBurnMinDaysPerWeek":4,"revivalOldDays":60,"revivalAbsentDays":14,"revivalMinGain":10,"takeoverTopTwenty":3,"takeoverEntries":5,"catalogMinOlderRising":2,"releaseWaveMinTracks":3,"resilienceDays":7,"resilienceBand":2,"resilienceZoneFall":-1,"volatilityDays":7,"volatilityStdDev":{"top":3,"middle":8,"bottom":12},"jumpThreshold":20}'::jsonb) on conflict (code) do nothing;

create or replace function public.complete_analysis(p_job uuid,p_token uuid,p_version text,p_inputs jsonb,p_summary jsonb,p_metrics jsonb,p_signals jsonb,p_brief text) returns uuid
language plpgsql security definer set search_path=public as $$
declare j pipeline_jobs; r uuid; e jsonb; sig uuid;
begin
  select * into j from pipeline_jobs where id=p_job and lease_token=p_token and status='running' and lease_until>now() and kind='calculate' for update;
  if not found then raise exception 'lost job lease'; end if;
  if not exists(select 1 from chart_snapshots where id=j.snapshot_id and status='approved') then raise exception 'snapshot no longer approved'; end if;
  if jsonb_array_length(p_metrics)<>100 then raise exception 'expected complete metric set'; end if;
  insert into analysis_runs(snapshot_id,job_id,formula_version,rule_version,inputs,summary) values(j.snapshot_id,j.id,p_version,coalesce(p_inputs->>'ruleVersion','signals-v2'),p_inputs,p_summary) returning id into r;
  for e in select value from jsonb_array_elements(p_metrics) loop
    if not exists(select 1 from chart_entries where id=(e->>'entryId')::uuid and snapshot_id=j.snapshot_id) then raise exception 'metric evidence mismatch'; end if;
    insert into chart_metrics(run_id,entry_id,song_id,metrics) values(r,(e->>'entryId')::uuid,(e->>'songId')::uuid,e);
  end loop;
  for e in select value from jsonb_array_elements(p_signals) loop
    insert into signals(signal_type,song_id,artist_id,chart_id,snapshot_id,severity,confidence,headline_summary,rule_version,analysis_run_id)
    values(e->>'type',(e->>'songId')::uuid,(e->>'artistId')::uuid,'00000000-0000-0000-0000-000000000010',j.snapshot_id,(e->>'severity')::severity,1,e->>'headline',coalesce(e->>'ruleVersion','signals-v2'),r) returning id into sig;
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
