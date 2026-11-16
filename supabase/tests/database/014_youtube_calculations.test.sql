begin;
select plan(13);
select function_privs_are('public', 'complete_youtube_calculation', array['uuid','uuid','date','jsonb','jsonb','jsonb','jsonb','jsonb','jsonb'], 'authenticated', array[]::text[], 'only the worker stores calculations');
set local role anon;
select throws_ok($q$select count(*) from youtube_tracked_chart$q$, '42501', null, 'the tracked chart is not public (D3)');
reset role;

insert into artists (id, canonical_name, sort_name) values ('85000000-0000-4000-8000-000000000001', 'Calc Artist', 'Calc Artist');
insert into songs (id, canonical_title, normalized_title) values ('85000000-0000-4000-8000-000000000011', 'Calc Song', 'calc song'), ('85000000-0000-4000-8000-000000000012', 'Other Song', 'other song');
insert into recordings (id, song_id) values ('85000000-0000-4000-8000-000000000021', '85000000-0000-4000-8000-000000000011'), ('85000000-0000-4000-8000-000000000022', '85000000-0000-4000-8000-000000000012');
insert into platform_assets (id, platform_id, platform_item_id, platform_artist_name, platform_title, recording_id)
values ('85000000-0000-4000-8000-000000000031', '00000000-0000-0000-0000-000000000002', 'vidCalc0001', 'UCcalcchannel00000000001', 'Calc', '85000000-0000-4000-8000-000000000021');
insert into youtube_video_assets (platform_asset_id, video_id, channel_id, discovery_source, link_status, verification, link_method, linked_at, asset_kind)
values ('85000000-0000-4000-8000-000000000031', 'vidCalc0001', 'UCcalcchannel00000000001', 'manual', 'linked', 'verified', 'editor', now(), 'official_music_video');

-- A successful statistics day queues that day's calculation.
insert into pipeline_jobs (id, kind, business_date, idempotency_key, status, attempts, lease_token, lease_until)
values ('85000000-0000-4000-8000-000000000041', 'youtube_daily_stats', '2026-11-10', 'test:stats:calc', 'running', 1, '85000000-0000-4000-8000-0000000000ff', now() + interval '5 minutes');
insert into collection_attempts (id, job_id, attempt_number, lease_token, source_url, http_status, raw_body, checksum)
values ('85000000-0000-4000-8000-000000000042', '85000000-0000-4000-8000-000000000041', 1, '85000000-0000-4000-8000-0000000000ff', 'https://www.googleapis.com/youtube/v3/videos', 200, '{}', 'x');
select lives_ok($q$select public.complete_youtube_stats('85000000-0000-4000-8000-000000000041', '85000000-0000-4000-8000-0000000000ff', '85000000-0000-4000-8000-000000000042', '[{"videoId":"vidCalc0001","availability":"available","viewCount":"100"}]')$q$, 'statistics stored');
select is((select count(*)::integer from pipeline_jobs where kind = 'youtube_calculate' and idempotency_key = 'youtube:calculate:2026-11-10:daily'), 1, 'a finished statistics day queues its calculation');

-- Relinking a video with statistics queues a recalculation from its first day.
update platform_assets set recording_id = '85000000-0000-4000-8000-000000000022' where id = '85000000-0000-4000-8000-000000000031';
select is((select business_date::text || '|' || reason from pipeline_jobs where kind = 'youtube_calculate' and reason like '%relinked%'), '2026-11-10|Video relinked to another recording', 'relinking recalculates from the earliest affected day');
update youtube_video_assets set asset_kind = 'live' where platform_asset_id = '85000000-0000-4000-8000-000000000031';
select is((select count(*)::integer from pipeline_jobs where kind = 'youtube_calculate' and reason like '%kind%'), 1, 'changing the kind recalculates too');

-- Store two runs covering the same day; the newer one is current.
create function pg_temp.calc(p_key text, p_gained integer) returns uuid language plpgsql as $$
declare j uuid;
begin
  insert into pipeline_jobs (kind, business_date, idempotency_key, status, attempts, lease_token, lease_until)
  values ('youtube_calculate', '2026-11-11', p_key, 'running', 1, '85000000-0000-4000-8000-0000000000ff', now() + interval '5 minutes') returning id into j;
  return public.complete_youtube_calculation(j, '85000000-0000-4000-8000-0000000000ff', '2026-11-11', '{"test":true}',
    format('[{"songId":"85000000-0000-4000-8000-000000000011","date":"2026-11-11","gained":%s,"intervalDays":1,"multiDay":false,"eligible":true,"byKind":{},"videos":1}]', p_gained)::jsonb,
    '[{"artistId":"85000000-0000-4000-8000-000000000001","date":"2026-11-11","gained":50,"songs":1,"multiDay":false}]',
    format('[{"date":"2026-11-11","rank":1,"songId":"85000000-0000-4000-8000-000000000011","gained":%s,"previousRank":null,"rankChange":null,"peakRank":1,"daysOnChart":1,"streak":0,"momentum":60}]', p_gained)::jsonb,
    '[{"assetId":"85000000-0000-4000-8000-000000000031","date":"2026-11-11","likesPerThousand":12.5,"commentsPerThousand":null}]',
    '[]');
end $$;
select isnt(pg_temp.calc('test:calc:1', 50), null, 'a calculation run is stored');
select isnt(pg_temp.calc('test:calc:2', 70), null, 'a recalculation adds a new run');
select is((select views_gained from youtube_tracked_chart where business_date = '2026-11-11'), 70::bigint, 'the newest run is current');
select is((select count(*)::integer from youtube_chart_entries where business_date = '2026-11-11'), 2, 'the earlier run is kept, not overwritten');
select throws_ok($q$update youtube_chart_entries set views_gained = 1$q$, 'P0001', 'youtube_chart_entries is append-only', 'calculation rows are immutable');
select throws_ok($q$insert into youtube_chart_entries (run_id, business_date, rank, song_id, views_gained, peak_rank, days_on_chart, streak, momentum) select run_id, business_date, 2, song_id, 0, 1, 1, 0, 0 from youtube_chart_entries limit 1$q$,
  '23514', null, 'a chart entry needs positive views gained');

-- Derived metrics share the statistics retention window (D5).
select ok((select (public.apply_youtube_retention('2027-01-31T00:00:00Z')->'counts'->>'youtubeDerivedMetrics')::integer >= 6), 'derived metrics are deleted at the end of the window');
select * from finish();
rollback;
