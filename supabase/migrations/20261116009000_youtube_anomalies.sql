-- A6: YouTube data-quality anomalies (yt-anomalies-v1), detected by
-- src/modules/youtube/anomalies.ts on each statistics day and stored in the
-- existing anomaly_alerts table against the tracked YouTube chart. A falling
-- view count is the A3 alert impossible_metric_movement and is not repeated.

insert into public.methodology_versions (code, title, notes, effective_from)
values ('yt-anomalies-v1', 'YouTube data-quality anomalies v1',
  'yt_implausible_jump (an observation gaining more than 40% of lifetime views on a video at least a year old), yt_video_unavailable, yt_asset_conflict (several primary videos for a song, or a primary change), yt_stale_payload, yt_partial_collection (more than 20% of the watchlist not collected), yt_methodology_break (informational, on YouTube''s counting-change dates). A falling view count is raised by collection as impossible_metric_movement.',
  '2026-11-16') on conflict (code) do nothing;
insert into public.methodology_configuration (code, parameters)
values ('yt-anomalies-v1', '{"jumpShare":0.4,"jumpMinAgeDays":365,"partialShare":0.2,"methodologyBreaks":[{"date":"2025-03-31","scope":"shorts"},{"date":"2026-08-27","scope":"all"}]}'::jsonb) on conflict (code) do nothing;

create function public.record_youtube_anomalies(p_job uuid, p_token uuid, p_anomalies jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare j pipeline_jobs; a jsonb; v_asset uuid; v_count integer := 0;
begin
  select * into j from pipeline_jobs where id = p_job and lease_token = p_token and lease_until > now() and status = 'running' and kind = 'youtube_daily_stats';
  if not found then raise exception 'lost job lease'; end if;
  for a in select * from jsonb_array_elements(p_anomalies) loop
    if a->>'type' not like 'yt\_%' or a->>'severity' not in ('low', 'medium', 'high') then raise exception 'invalid anomaly'; end if;
    v_asset := (select platform_asset_id from youtube_video_assets where video_id = a->>'videoId');
    -- One alert per type, video and business date.
    if exists (select 1 from anomaly_alerts where chart_id = '00000000-0000-0000-0000-000000000020' and anomaly_type = a->>'type'
               and platform_asset_id is not distinct from v_asset and evidence->>'date' = j.business_date::text) then continue; end if;
    insert into anomaly_alerts (chart_id, platform_asset_id, anomaly_type, severity, summary, expected_value, observed_value, evidence)
    values ('00000000-0000-0000-0000-000000000020', v_asset, a->>'type', (a->>'severity')::severity, left(a->>'summary', 1000),
            a->'expected', a->'observed', coalesce(a->'evidence', '{}') || jsonb_build_object('ruleVersion', a->>'ruleVersion', 'jobId', p_job, 'date', j.business_date));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.record_youtube_anomalies(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_youtube_anomalies(uuid, uuid, jsonb) to service_role;
