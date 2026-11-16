begin;
select plan(20);

select function_privs_are('public', 'complete_youtube_stats', array['uuid','uuid','uuid','jsonb'], 'authenticated', array[]::text[], 'staff cannot write statistics');
select function_privs_are('public', 'complete_youtube_stats', array['uuid','uuid','uuid','jsonb'], 'service_role', array['EXECUTE'], 'the worker writes statistics');
select throws_ok($q$select public.enqueue_youtube_stats(current_date - 1)$q$, 'P0001', 'YouTube statistics cannot be backfilled', 'missed days are never backfilled');
select is((select active from charts where slug = 'youtube-tracked-mn'), false, 'the tracked chart is dashboard-only (D3)');
select ok((select parameters->'breaks' @> '[{"date":"2026-08-27"}]' from methodology_configuration where code = 'youtube-view-methodology-breaks'), 'methodology breaks are configured');

-- Fixtures: three tracked videos.
insert into platform_assets (id, platform_id, platform_item_id, platform_artist_name, platform_title)
select ('84000000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000002', 'vidStats00' || n, 'UCstatschannel0000000001', 'Old title ' || n
from generate_series(1, 3) n;
insert into youtube_video_assets (platform_asset_id, video_id, channel_id, discovery_source, link_status, verification, link_method, linked_at)
select ('84000000-0000-4000-8000-00000000000' || n)::uuid, 'vidStats00' || n, 'UCstatschannel0000000001', 'manual', 'linked', 'verified', 'editor', now()
from generate_series(1, 3) n;

create function pg_temp.job(p_date date, p_key text) returns uuid language sql as $$
  insert into pipeline_jobs (kind, business_date, idempotency_key, status, attempts, lease_token, lease_until)
  values ('youtube_daily_stats', p_date, p_key, 'running', 1, '84000000-0000-4000-8000-0000000000ff', now() + interval '5 minutes') returning id
$$;
create function pg_temp.attempt(p_job uuid) returns uuid language sql as $$
  insert into collection_attempts (job_id, attempt_number, lease_token, source_url, http_status, raw_body, checksum)
  values (p_job, 1, '84000000-0000-4000-8000-0000000000ff', 'https://www.googleapis.com/youtube/v3/videos', 200, '{}', md5(p_job::text)) returning id
$$;
create temporary table run (k text primary key, job uuid, attempt uuid, result jsonb);
insert into run select 'day1', j, pg_temp.attempt(j), null from pg_temp.job('2026-11-14', 'test:stats:1') j;

update run set result = public.complete_youtube_stats(job, '84000000-0000-4000-8000-0000000000ff', attempt,
  '[{"videoId":"vidStats001","availability":"available","viewCount":"1000","likeCount":"50","commentCount":"5","title":"Fresh title","channelTitle":"Saran","durationSeconds":201},
    {"videoId":"vidStats002","availability":"available","viewCount":"500","likeCount":null,"commentCount":"2"},
    {"videoId":"vidStats003","availability":"missing"}]') where k = 'day1';
select is((select result from run where k = 'day1'), '{"private": 0, "anomaly": 0, "missing": 1, "approved": 2, "requested": 3}'::jsonb, 'a normal batch with one missing video');
select is((select error_code || ': ' || error_message from pipeline_jobs where id = (select job from run where k = 'day1')),
  'partial: 2 of 3 videos approved; 1 missing, 0 private, 0 anomalies', 'partial success is visible on the job');
select is((select retention_class::text from youtube_video_statistics limit 1), 'youtube_statistics', 'rows are YouTube statistics for retention');
select is((select coalesce(view_count::text, '-') || '|' || availability from youtube_video_statistics s join youtube_video_assets y using (platform_asset_id) where y.video_id = 'vidStats003'),
  '-|missing', 'a missing video is recorded as missing, with no counts');
select is((select like_count from youtube_video_statistics s join youtube_video_assets y using (platform_asset_id) where y.video_id = 'vidStats002'), null, 'a hidden like count stays empty, not zero');
select is((select platform_title from platform_assets where id = '84000000-0000-4000-8000-000000000001'), 'Fresh title', 'collection refreshes the title');
select ok((select metadata_refreshed_at is not null from youtube_video_assets where video_id = 'vidStats001'), 'and restarts the 30-day metadata clock');

-- Next day: video 1 falls (anomaly), video 2 rises, video 3 is now private.
insert into run select 'day2', j, pg_temp.attempt(j), null from pg_temp.job('2026-11-15', 'test:stats:2') j;
update run set result = public.complete_youtube_stats(job, '84000000-0000-4000-8000-0000000000ff', attempt,
  '[{"videoId":"vidStats001","availability":"available","viewCount":"900","likeCount":"50","commentCount":"5"},
    {"videoId":"vidStats002","availability":"available","viewCount":"700","likeCount":"3","commentCount":"2"},
    {"videoId":"vidStats003","availability":"private"}]') where k = 'day2';
select is((select status || '|' || anomaly_code from youtube_video_statistics s join youtube_video_assets y using (platform_asset_id) where y.video_id = 'vidStats001' and business_date = '2026-11-15'),
  'anomaly|impossible_metric_movement', 'a view count below the last approved value is an anomaly, not a fact');
select is((select count(*)::integer from anomaly_alerts where anomaly_type = 'impossible_metric_movement' and platform_asset_id = '84000000-0000-4000-8000-000000000001'), 1, 'the anomaly is raised for review');
select is((select (result->>'private')::integer from run where k = 'day2'), 1, 'a private video is recorded as private');

-- Day 3: the comparison uses the last approved value, not the anomaly.
insert into run select 'day3', j, pg_temp.attempt(j), null from pg_temp.job('2026-11-16', 'test:stats:3') j;
update run set result = public.complete_youtube_stats(job, '84000000-0000-4000-8000-0000000000ff', attempt,
  '[{"videoId":"vidStats001","availability":"available","viewCount":"950"}]') where k = 'day3';
select is((select status from youtube_video_statistics s join youtube_video_assets y using (platform_asset_id) where y.video_id = 'vidStats001' and business_date = '2026-11-16'),
  'anomaly', 'still below the last approved 1,000, so still an anomaly');

select throws_ok($q$select public.complete_youtube_stats((select job from run where k = 'day3'), '84000000-0000-4000-8000-0000000000ff', (select attempt from run where k = 'day3'), '[]')$q$,
  'P0001', 'lost job lease', 'a finished job cannot write again');
insert into run select 'bad', j, pg_temp.attempt(j), null from pg_temp.job('2026-11-17', 'test:stats:4') j;
select throws_ok($q$select public.complete_youtube_stats((select job from run where k = 'bad'), '84000000-0000-4000-8000-0000000000ff', (select attempt from run where k = 'bad'), '[{"videoId":"vidStats002","availability":"available","viewCount":"-5"}]')$q$,
  'P0001', 'counts must be non-negative integers', 'negative counts are rejected');
select throws_ok($q$delete from youtube_video_statistics$q$, 'P0001', 'youtube_video_statistics is append-only', 'statistics cannot be deleted outside retention');

-- Retention removes statistics at the end of the window (30-day mode).
select is((select (public.apply_youtube_retention('2026-12-31T00:00:00Z')->'counts'->>'youtubeVideoStatistics')::integer), 7, 'expired statistics are deleted by the retention job');

select * from finish();
rollback;
