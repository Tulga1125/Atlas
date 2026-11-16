begin;
select plan(5);
select function_privs_are('public', 'record_youtube_anomalies', array['uuid','uuid','jsonb'], 'authenticated', array[]::text[], 'only the worker records YouTube anomalies');
insert into pipeline_jobs (id, kind, business_date, idempotency_key, status, attempts, lease_token, lease_until)
values ('87000000-0000-4000-8000-000000000001', 'youtube_daily_stats', '2026-11-16', 'test:anomalies', 'running', 1, '87000000-0000-4000-8000-0000000000ff', now() + interval '5 minutes');
create temporary table input as select '[{"type":"yt_partial_collection","severity":"high","videoId":null,"summary":"3 of 10 missing","expected":{"maximumMissingShare":0.2},"observed":{"missing":3},"evidence":{},"ruleVersion":"yt-anomalies-v1"}]'::jsonb as a;
select is((select public.record_youtube_anomalies('87000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-0000000000ff', a) from input), 1, 'an anomaly is stored');
select is((select public.record_youtube_anomalies('87000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-0000000000ff', a) from input), 0, 'the same anomaly is not raised twice for a day');
select is((select evidence->>'ruleVersion' || '|' || status::text from anomaly_alerts where anomaly_type = 'yt_partial_collection'), 'yt-anomalies-v1|open', 'it carries its rule version and opens for review');
select throws_ok($q$select public.record_youtube_anomalies('87000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-0000000000ff', '[{"type":"mass_chart_replacement","severity":"high"}]')$q$, 'P0001', 'invalid anomaly', 'only YouTube anomaly types are accepted');
select * from finish();
rollback;
