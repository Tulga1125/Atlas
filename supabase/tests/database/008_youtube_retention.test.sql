begin;
select plan(39);

-- Privileges: only the server runs retention; only administrators change mode.
select function_privs_are('public', 'apply_youtube_retention', array['timestamp with time zone','uuid'], 'authenticated', array[]::text[], 'staff cannot run retention directly');
select function_privs_are('public', 'apply_youtube_retention', array['timestamp with time zone','uuid'], 'anon', array[]::text[], 'anonymous callers cannot run retention');
select function_privs_are('public', 'apply_youtube_retention', array['timestamp with time zone','uuid'], 'service_role', array['EXECUTE'], 'server runs retention');
select function_privs_are('public', 'enqueue_youtube_retention', array['date'], 'authenticated', array[]::text[], 'staff cannot enqueue retention');

-- Fixtures: one artist with a verified YouTube channel and an Apple profile.
insert into artists (id, canonical_name, sort_name) values ('81000000-0000-4000-8000-000000000001', 'Retention Test Artist', 'Retention Test Artist');
insert into artist_platform_profiles (id, artist_id, platform_id, platform_artist_id, match_status, match_method, metadata, last_enriched_at) values
  ('81000000-0000-4000-8000-000000000011', '81000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000002', 'UCretentiontest', 'verified', 'manual',
   '{"sourceName":"Channel name","description":"About","imageUrl":"https://i.ytimg.com/x.jpg","verifiedBy":"editor"}', '2026-01-01T00:00:00Z'),
  ('81000000-0000-4000-8000-000000000012', '81000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001', 'apple-retention-test', 'verified', 'source',
   '{"sourceName":"Apple name"}', '2026-01-01T00:00:00Z');
insert into artist_intelligence_runs (id, source_platform_id, idempotency_key, scheduled_for) values
  ('81000000-0000-4000-8000-000000000021', '00000000-0000-0000-0000-000000000002', 'test:youtube:old', '2026-01-01T00:00:00Z'),
  ('81000000-0000-4000-8000-000000000022', '00000000-0000-0000-0000-000000000002', 'test:youtube:fresh', '2026-03-01T00:00:00Z'),
  ('81000000-0000-4000-8000-000000000023', '00000000-0000-0000-0000-000000000001', 'test:apple:old', '2026-01-01T00:00:00Z');
insert into artist_source_payloads (id, run_id, source_url, checksum, payload, received_at, purged_at) values
  ('81000000-0000-4000-8000-000000000031', '81000000-0000-4000-8000-000000000021', 'https://www.googleapis.com/youtube/v3/channels?id=UCretentiontest', 'sha-old-youtube', '{"items":[{"snippet":{"title":"Channel name"}}]}', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'),
  ('81000000-0000-4000-8000-000000000032', '81000000-0000-4000-8000-000000000022', 'https://www.googleapis.com/youtube/v3/channels?id=UCretentiontest', 'sha-fresh-youtube', '{"items":[]}', '2026-03-01T00:00:00Z', null),
  ('81000000-0000-4000-8000-000000000033', '81000000-0000-4000-8000-000000000023', 'https://api.music.apple.com/v1/catalog/mn/artists/1', 'sha-old-apple', '{"data":[]}', '2026-01-01T00:00:00Z', null);

select is((select retention_class::text from artist_source_payloads where id = '81000000-0000-4000-8000-000000000031'), 'youtube_metadata', 'raw YouTube responses are classified automatically');
select is((select retention_class::text from artist_source_payloads where id = '81000000-0000-4000-8000-000000000033'), 'permanent', 'Apple responses stay permanent');
select is((select purged_at from artist_source_payloads where id = '81000000-0000-4000-8000-000000000031'), null, 'rows cannot be inserted pre-purged');

insert into artist_metric_snapshots (id, artist_id, platform_id, profile_id, raw_payload_id, metric_date, metric_name, metric_value, unit, methodology_version) values
  ('81000000-0000-4000-8000-000000000041', '81000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000002', '81000000-0000-4000-8000-000000000011', '81000000-0000-4000-8000-000000000031', '2026-01-01', 'total_views', 100, 'views', 'youtube-channel-statistics-v1'),
  ('81000000-0000-4000-8000-000000000042', '81000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000002', '81000000-0000-4000-8000-000000000011', '81000000-0000-4000-8000-000000000032', '2026-03-01', 'total_views', 200, 'views', 'youtube-channel-statistics-v1'),
  ('81000000-0000-4000-8000-000000000043', '81000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001', '81000000-0000-4000-8000-000000000012', '81000000-0000-4000-8000-000000000033', '2026-01-01', 'video_count', 5, 'videos', 'apple-test-v1');
select is((select retention_class::text from artist_metric_snapshots where id = '81000000-0000-4000-8000-000000000042'), 'youtube_statistics', 'YouTube counts are classified as statistics');
select is((select retention_class::text from artist_metric_snapshots where id = '81000000-0000-4000-8000-000000000043'), 'permanent', 'Apple metrics stay permanent');

-- The append-only guard still holds outside a retention run.
select throws_ok($q$delete from artist_metric_snapshots where id = '81000000-0000-4000-8000-000000000041'$q$, 'P0001', 'artist_metric_snapshots is append-only', 'YouTube statistics cannot be deleted ad hoc');
select throws_ok($q$update artist_source_payloads set payload = '{}' where id = '81000000-0000-4000-8000-000000000031'$q$, 'P0001', 'artist_source_payloads is append-only', 'YouTube payloads cannot be edited ad hoc');
-- Even with the retention flag forged, permanent rows stay untouchable.
select set_config('atlas.retention', 'purge', true);
select throws_ok($q$delete from artist_metric_snapshots where id = '81000000-0000-4000-8000-000000000043'$q$, 'P0001', 'artist_metric_snapshots is append-only', 'retention flag cannot delete Apple metrics');
select throws_ok($q$update artist_source_payloads set purged_at = now(), payload = '{}' where id = '81000000-0000-4000-8000-000000000033'$q$, 'P0001', 'artist_source_payloads is append-only', 'retention flag cannot tombstone Apple payloads');
select throws_ok($q$update artist_source_payloads set checksum = 'forged', purged_at = now() where id = '81000000-0000-4000-8000-000000000031'$q$, 'P0001', 'artist_source_payloads is append-only', 'a tombstone keeps its original checksum');
select set_config('atlas.retention', '', true);

-- 30-day mode, run on 15 March 2026: January data has expired, March has not.
create temporary table run_30 as select public.apply_youtube_retention('2026-03-15T00:00:00Z') as result;
select is((select (result->'counts'->>'artistSourcePayloads')::integer from run_30), 1, 'one expired YouTube payload is tombstoned');
select is((select payload->>'reason' from artist_source_payloads where id = '81000000-0000-4000-8000-000000000031'), 'deleted under YouTube retention policy', 'tombstone states why the content is gone');
select is((select checksum || '|' || received_at::text from artist_source_payloads where id = '81000000-0000-4000-8000-000000000031'), 'sha-old-youtube|2026-01-01 00:00:00+00', 'tombstone keeps original checksum and fetch time');
select ok((select payload::text not like '%Channel name%' from artist_source_payloads where id = '81000000-0000-4000-8000-000000000031'), 'tombstone holds no YouTube content');
select is((select payload->>'items' from artist_source_payloads where id = '81000000-0000-4000-8000-000000000032'), '[]', 'fresh YouTube payload is kept');
select is((select payload from artist_source_payloads where id = '81000000-0000-4000-8000-000000000033'), '{"data": []}'::jsonb, 'Apple payload is untouched');
select is((select count(*)::integer from artist_metric_snapshots where id = '81000000-0000-4000-8000-000000000041'), 0, 'expired YouTube statistics are deleted');
select is((select count(*)::integer from artist_metric_snapshots where id in ('81000000-0000-4000-8000-000000000042','81000000-0000-4000-8000-000000000043')), 2, 'fresh YouTube and all Apple statistics remain');
select ok((select not (metadata ? 'sourceName') and not (metadata ? 'imageUrl') and metadata->>'verifiedBy' = 'editor' from artist_platform_profiles where id = '81000000-0000-4000-8000-000000000011'), 'channel name and thumbnail are stripped; Atlas review data stays');
select is((select metadata->>'sourceName' from artist_platform_profiles where id = '81000000-0000-4000-8000-000000000012'), 'Apple name', 'Apple profile metadata is untouched');
select is((select count(*)::integer from audit_logs where action = 'youtube_retention_purge' and correlation_id = (select (result->>'runId')::uuid from run_30)), 3, 'each deletion batch is audited');
select ok((select bool_and(after_data ? 'count' and after_data ? 'retentionClass' and not (after_data::text like '%Channel name%')) from audit_logs where action = 'youtube_retention_purge'), 'audit rows record counts and class, never content');
select is((select count(*)::integer from retention_runs where id = (select (result->>'runId')::uuid from run_30)), 1, 'the run is recorded');

-- A second run is idempotent: nothing left to purge, but the run is still logged.
create temporary table run_again as select public.apply_youtube_retention('2026-03-15T00:00:00Z') as result;
select is((select result->'counts' from run_again), '{"rawPayloads": 0, "collectionAttempts": 0, "artistSourcePayloads": 0, "artistPlatformProfiles": 0, "artistMetricSnapshots": 0}'::jsonb, 'a repeat run purges nothing more');
select is((select count(*)::integer from audit_logs where action = 'youtube_retention_run'), 2, 'every run is audited, even an empty one');

-- 36-month mode keeps statistics far longer, but metadata still expires at 30 days.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'retention-admin@atlas.test', '', now(), '{}', '{"display_name":"Retention Admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'retention-editor@atlas.test', '', now(), '{}', '{"display_name":"Retention Editor"}', now(), now());
update profiles set role = 'administrator' where id = '81000000-0000-4000-8000-0000000000a1';
update profiles set role = 'data_editor' where id = '81000000-0000-4000-8000-0000000000a2';
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-0000000000a2', true);
select throws_ok($q$select public.set_youtube_retention_mode('36_month', 'Derived-metrics amendment accepted')$q$, 'P0001', 'forbidden', 'data editors cannot change the retention mode');
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-0000000000a1', true);
select throws_ok($q$select public.set_youtube_retention_mode('36_month', 'short')$q$, 'P0001', 'a reason of at least 10 characters is required', 'a mode change needs a reason');
create temporary table mode_change as select public.set_youtube_retention_mode('36_month', 'Derived-metrics amendment accepted by YouTube') as code;
reset role;
select is((select public.youtube_retention_config()->>'mode'), '36_month', 'administrator switches to 36-month mode');
select ok((select effective_until is not null from methodology_versions where code = 'youtube-retention-30-day-v1'), 'previous methodology version is closed');
select is((select count(*)::integer from methodology_versions where code = (select code from mode_change)), 1, 'mode change creates a new methodology version');
select is((select reason from audit_logs where action = 'youtube_retention_mode_changed'), 'Derived-metrics amendment accepted by YouTube', 'mode change is audited with its reason');
select is((select count(*)::integer from methodology_configuration where code = 'youtube-retention-30-day-v1'), 1, 'the earlier configuration row is preserved');

insert into artist_metric_snapshots (id, artist_id, platform_id, profile_id, raw_payload_id, metric_date, metric_name, metric_value, unit, methodology_version) values
  ('81000000-0000-4000-8000-000000000044', '81000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000002', '81000000-0000-4000-8000-000000000011', '81000000-0000-4000-8000-000000000032', '2026-03-02', 'subscribers', 10, 'people', 'youtube-channel-statistics-v1');
create temporary table run_36 as select public.apply_youtube_retention('2026-06-01T00:00:00Z') as result;
select is((select (result->'counts'->>'artistMetricSnapshots')::integer from run_36), 0, '36-month mode keeps three-month-old statistics');
select is((select (result->'counts'->>'artistSourcePayloads')::integer from run_36), 1, '36-month mode still tombstones raw responses after 30 days');
select is((select result->>'statisticsCutoff' from run_36), '2023-06-01', 'statistics cutoff is 36 calendar months back');

select * from finish();
rollback;
