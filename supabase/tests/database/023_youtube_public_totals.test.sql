begin;
select plan(7);
select function_privs_are('public', 'public_youtube_artist_ranking', array[]::text[], 'anon', array['EXECUTE'], 'anyone can read the ranking');
select function_privs_are('public', 'youtube_song_view_totals', array[]::text[], 'anon', array[]::text[], 'the raw totals are internal');
select ok(exists (select 1 from methodology_versions where code = 'youtube-metrics-v2'), 'v2 is recorded');

insert into artists (id, canonical_name, sort_name, source_key, verification, locality, country_code) values
  ('8d000000-0000-4000-8000-000000000001', 'Local Star', 'local star', 'test:ls', 'verified', 'local', 'MN'),
  ('8d000000-0000-4000-8000-000000000002', 'Abroad', 'abroad', 'test:ab', 'verified', 'international', null);
insert into artist_platform_profiles (artist_id, platform_id, platform_artist_id, match_status, match_method)
values ('8d000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000002', 'UCownownownownownownown1', 'verified', 'manual');
insert into songs (id, canonical_title, normalized_title, primary_artist_id) values
  ('8d000000-0000-4000-8000-0000000000a1', 'Hit', 'hit', '8d000000-0000-4000-8000-000000000001'),
  ('8d000000-0000-4000-8000-0000000000a2', 'Deep Cut', 'deep cut', '8d000000-0000-4000-8000-000000000001'),
  ('8d000000-0000-4000-8000-0000000000a3', 'Foreign', 'foreign', '8d000000-0000-4000-8000-000000000002');
insert into song_artists (song_id, artist_id) values
  ('8d000000-0000-4000-8000-0000000000a1', '8d000000-0000-4000-8000-000000000001'),
  ('8d000000-0000-4000-8000-0000000000a2', '8d000000-0000-4000-8000-000000000001'),
  ('8d000000-0000-4000-8000-0000000000a3', '8d000000-0000-4000-8000-000000000002');
insert into recordings (id, song_id) values
  ('8d000000-0000-4000-8000-0000000000b1', '8d000000-0000-4000-8000-0000000000a1'),
  ('8d000000-0000-4000-8000-0000000000b2', '8d000000-0000-4000-8000-0000000000a2'),
  ('8d000000-0000-4000-8000-0000000000b3', '8d000000-0000-4000-8000-0000000000a3');
insert into platform_assets (id, platform_id, recording_id, platform_item_id, platform_artist_name, platform_title) values
  ('8d000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000002', '8d000000-0000-4000-8000-0000000000b1', 'ccccccccc01', 'Local Star', 'Hit'),
  ('8d000000-0000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000002', '8d000000-0000-4000-8000-0000000000b2', 'ccccccccc02', 'Local Star', 'Deep Cut'),
  ('8d000000-0000-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000002', '8d000000-0000-4000-8000-0000000000b1', 'ccccccccc03', 'Fan', 'Hit fan upload'),
  ('8d000000-0000-4000-8000-0000000000c4', '00000000-0000-0000-0000-000000000002', '8d000000-0000-4000-8000-0000000000b3', 'ccccccccc04', 'Abroad', 'Foreign');
insert into youtube_video_assets (platform_asset_id, video_id, channel_id, asset_kind, link_status, verification, link_method, linked_at, discovery_source) values
  ('8d000000-0000-4000-8000-0000000000c1', 'ccccccccc01', 'UCownownownownownownown1', 'other', 'linked', 'verified', 'editor', now(), 'manual'),
  ('8d000000-0000-4000-8000-0000000000c2', 'ccccccccc02', 'UCownownownownownownown1', 'live', 'linked', 'verified', 'editor', now(), 'manual'),
  ('8d000000-0000-4000-8000-0000000000c3', 'ccccccccc03', 'UCfanfanfanfanfanfanfan1', 'other', 'linked', 'verified', 'editor', now(), 'manual'),
  ('8d000000-0000-4000-8000-0000000000c4', 'ccccccccc04', 'UCabroadabroadabroadabr1', 'official_music_video', 'linked', 'verified', 'editor', now(), 'manual');
insert into pipeline_jobs (id, kind, business_date, idempotency_key, status, attempts, lease_token) values
  ('8d000000-0000-4000-8000-0000000000d1', 'youtube_daily_stats', current_date, 'test:totals', 'succeeded', 1, '8d000000-0000-4000-8000-0000000000d2');
insert into collection_attempts (id, job_id, attempt_number, lease_token, source_url, http_status, raw_body, checksum) values
  ('8d000000-0000-4000-8000-0000000000d3', '8d000000-0000-4000-8000-0000000000d1', 1, '8d000000-0000-4000-8000-0000000000d2', 'https://example.test', 200, '{}', 'x');
insert into youtube_video_statistics (platform_asset_id, business_date, fetched_at, view_count, availability, status, job_id, attempt_id) values
  ('8d000000-0000-4000-8000-0000000000c1', (now() at time zone 'Asia/Ulaanbaatar')::date - 400, now(), 1, 'available', 'approved', '8d000000-0000-4000-8000-0000000000d1', '8d000000-0000-4000-8000-0000000000d3'),
  ('8d000000-0000-4000-8000-0000000000c1', (now() at time zone 'Asia/Ulaanbaatar')::date, now(), 900, 'available', 'approved', '8d000000-0000-4000-8000-0000000000d1', '8d000000-0000-4000-8000-0000000000d3'),
  ('8d000000-0000-4000-8000-0000000000c2', (now() at time zone 'Asia/Ulaanbaatar')::date, now(), 100, 'available', 'approved', '8d000000-0000-4000-8000-0000000000d1', '8d000000-0000-4000-8000-0000000000d3'),
  ('8d000000-0000-4000-8000-0000000000c3', (now() at time zone 'Asia/Ulaanbaatar')::date, now(), 5000, 'available', 'approved', '8d000000-0000-4000-8000-0000000000d1', '8d000000-0000-4000-8000-0000000000d3'),
  ('8d000000-0000-4000-8000-0000000000c4', (now() at time zone 'Asia/Ulaanbaatar')::date, now(), 777, 'available', 'approved', '8d000000-0000-4000-8000-0000000000d1', '8d000000-0000-4000-8000-0000000000d3');

select is((select string_agg(title || ':' || views, ',' order by views desc) from public.public_youtube_song_totals('8d000000-0000-4000-8000-000000000001')),
  'Hit:900,Deep Cut:100', 'own-channel videos count whatever their kind; a fan upload does not');
select is((select total_views || '/' || average_views || '/' || songs from public.public_youtube_artist_ranking() where artist_id = '8d000000-0000-4000-8000-000000000001'),
  '1000/500/2', 'average = total views ÷ songs');
select is((select count(*)::integer from public.public_youtube_artist_ranking() where artist_id = '8d000000-0000-4000-8000-000000000002'), 0, 'international artists are not ranked');
select is((select count(*)::integer from public.public_youtube_song_totals('8d000000-0000-4000-8000-000000000001') where views = 1), 0, 'figures older than the window are never used');
select * from finish();
rollback;
