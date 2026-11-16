begin;
select plan(5);
select ok((select (parameters->>'enabled')::boolean from methodology_configuration where code = 'youtube-trending-v1'), 'the feed is on after a meaningful probe');
select function_privs_are('public', 'record_youtube_trending', array['uuid','uuid','uuid','jsonb'], 'authenticated', array[]::text[], 'only the worker records trending positions');
insert into platform_assets (id, platform_id, platform_item_id, platform_artist_name, platform_title)
values ('86000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000002', 'vidTrend001', 'UCtrendchannel0000000001', 'Trend');
insert into youtube_video_assets (platform_asset_id, video_id, channel_id, discovery_source) values ('86000000-0000-4000-8000-000000000001', 'vidTrend001', 'UCtrendchannel0000000001', 'most_popular_mn');
insert into pipeline_jobs (id, kind, business_date, idempotency_key, status, attempts, lease_token, lease_until)
values ('86000000-0000-4000-8000-000000000011', 'youtube_discovery', '2026-11-01', 'test:trend', 'running', 1, '86000000-0000-4000-8000-0000000000ff', now() + interval '5 minutes');
insert into collection_attempts (id, job_id, attempt_number, lease_token, source_url, http_status, raw_body, checksum)
values ('86000000-0000-4000-8000-000000000012', '86000000-0000-4000-8000-000000000011', 1, '86000000-0000-4000-8000-0000000000ff', 'https://www.googleapis.com/youtube/v3/videos?chart=mostPopular', 200, '{}', 'x');
select is((select public.record_youtube_trending('86000000-0000-4000-8000-000000000011', '86000000-0000-4000-8000-0000000000ff', '86000000-0000-4000-8000-000000000012', '["unknownvid1","vidTrend001"]')), 1, 'positions are recorded for known videos only');
select is((select position from youtube_trending_entries where platform_asset_id = '86000000-0000-4000-8000-000000000001'), 2, 'the position is YouTube''s list order');
select is((select (public.apply_youtube_retention('2026-12-15T00:00:00Z')->'counts'->>'youtubeTrendingEntries')::integer), 1, 'positions expire after 30 days');
select * from finish();
rollback;
