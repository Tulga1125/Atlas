begin;
select plan(17);

select has_table('public', 'artist_platform_profiles', 'artist platform profiles exist');
select has_table('public', 'artist_verification_evidence', 'artist verification evidence exists');
select has_table('public', 'artist_intelligence_runs', 'artist intelligence runs exist');
select has_table('public', 'artist_source_payloads', 'artist source payloads exist');
select has_table('public', 'artist_metric_snapshots', 'artist metric snapshots exist');
select has_view('public', 'artist_chart_daily_stats', 'daily artist chart stats view exists');
select has_view('public', 'artist_chart_career_stats', 'career artist chart stats view exists');
select has_view('public', 'artist_latest_metrics', 'latest artist metrics view exists');

insert into public.artists (
  id,
  canonical_name,
  sort_name,
  source_key,
  country_code,
  locality,
  verification
) values
  (
    '60000000-0000-4000-8000-000000000001',
    'Verified Local Artist',
    'verified local artist',
    'test:verified-local-artist',
    'MN',
    'local',
    'verified'
  ),
  (
    '60000000-0000-4000-8000-000000000002',
    'Suggested Artist',
    'suggested artist',
    'test:suggested-artist',
    null,
    'unknown',
    'suggested'
  );

insert into public.artist_platform_profiles (
  id,
  artist_id,
  platform_id,
  platform_artist_id,
  profile_url,
  match_status,
  match_method,
  confidence
) values
  (
    '61000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'verified-channel',
    'https://www.youtube.com/channel/verified-channel',
    'verified',
    'manual',
    1
  ),
  (
    '61000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'suggested-channel',
    'https://www.youtube.com/channel/suggested-channel',
    'suggested',
    'url',
    0.7
  );

insert into public.artist_intelligence_runs (
  id,
  source_platform_id,
  idempotency_key,
  scheduled_for,
  status
) values (
  '62000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'test:youtube:2026-08-30',
  '2026-08-30T06:00:00+08:00',
  'succeeded'
);

insert into public.artist_source_payloads (
  id,
  run_id,
  source_url,
  checksum,
  payload
) values (
  '63000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001',
  'https://www.googleapis.com/youtube/v3/channels',
  repeat('c', 64),
  '{"fixture":true}'::jsonb
);

insert into public.artist_metric_snapshots (
  artist_id,
  platform_id,
  profile_id,
  raw_payload_id,
  metric_date,
  collected_at,
  metric_name,
  metric_value,
  unit,
  methodology_version
) values (
  '60000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '61000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000001',
  '2026-08-30',
  '2026-08-30T06:05:00+08:00',
  'subscribers',
  12000,
  'people',
  'youtube-channel-statistics-v1'
);

insert into public.collection_jobs (
  id,
  chart_id,
  idempotency_key,
  scheduled_for,
  status
) values (
  '64000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  'test:artist-stats:2026-08-30',
  '2026-08-30T06:00:00+08:00',
  'succeeded'
);

insert into public.raw_payloads (
  id,
  collection_job_id,
  source_url,
  checksum,
  payload
) values (
  '65000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-000000000001',
  'https://api.music.apple.com/test/artist-stats',
  repeat('d', 64),
  '{"fixture":true}'::jsonb
);

insert into public.songs (
  id,
  canonical_title,
  normalized_title,
  source_key,
  primary_artist_id,
  locality,
  verification
) values (
  '66000000-0000-4000-8000-000000000001',
  'Verified Song',
  'verified song',
  'test:verified-song',
  '60000000-0000-4000-8000-000000000001',
  'local',
  'verified'
);

insert into public.song_artists (song_id, artist_id, credit_role, credit_order)
values (
  '66000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  'primary',
  0
);

insert into public.recordings (id, song_id, recording_type)
values (
  '67000000-0000-4000-8000-000000000001',
  '66000000-0000-4000-8000-000000000001',
  'original'
);

insert into public.platform_assets (
  id,
  platform_id,
  recording_id,
  platform_item_id,
  platform_artist_id,
  platform_artist_name,
  platform_title
) values (
  '68000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '67000000-0000-4000-8000-000000000001',
  'test-verified-song',
  'test-verified-artist',
  'Verified Local Artist',
  'Verified Song'
);

-- These small fixtures exercise RLS/artist aggregates, not ingestion.
alter table public.chart_snapshots disable trigger snapshot_protection;
alter table public.chart_entries disable trigger chart_entries_approved_immutable;
insert into public.chart_snapshots (
  id,
  chart_id,
  collection_job_id,
  raw_payload_id,
  snapshot_date,
  collected_at,
  entry_count,
  status,
  checksum,
  is_complete,
  approved_at
) values (
  '69000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  '64000000-0000-4000-8000-000000000001',
  '65000000-0000-4000-8000-000000000001',
  '2026-08-30',
  '2026-08-30T06:04:00+08:00',
  1,
  'approved',
  repeat('e', 64),
  true,
  '2026-08-30T06:05:00+08:00'
);

insert into public.chart_entries (
  snapshot_id,
  platform_asset_id,
  song_id,
  rank,
  previous_rank,
  rank_change,
  entry_status,
  peak_rank,
  days_on_chart,
  momentum_score
) values (
  '69000000-0000-4000-8000-000000000001',
  '68000000-0000-4000-8000-000000000001',
  '66000000-0000-4000-8000-000000000001',
  3,
  8,
  5,
  'up',
  3,
  4,
  85
);

alter table public.chart_snapshots enable trigger snapshot_protection;
alter table public.chart_entries enable trigger chart_entries_approved_immutable;

select is(
  (select peak_rank from public.artist_chart_career_stats where artist_id = '60000000-0000-4000-8000-000000000001'),
  3,
  'career stats derive the best rank from approved snapshots'
);

select is(
  (select metric_value from public.artist_latest_metrics where artist_id = '60000000-0000-4000-8000-000000000001' and metric_name = 'subscribers'),
  12000::numeric,
  'latest metrics expose the retained source value'
);

select throws_ok(
  $$update public.artist_source_payloads set payload = '{}'::jsonb where id = '63000000-0000-4000-8000-000000000001'$$,
  'artist_source_payloads is append-only',
  'artist source payloads cannot be changed'
);

select throws_ok(
  $$delete from public.artist_metric_snapshots where artist_id = '60000000-0000-4000-8000-000000000001'$$,
  'artist_metric_snapshots is append-only',
  'artist metric snapshots cannot be deleted'
);

select ok(
  has_table_privilege('anon', 'public.artist_metric_snapshots', 'SELECT'),
  'anonymous clients can query public artist metrics through RLS'
);

select ok(
  not has_table_privilege('anon', 'public.artist_source_payloads', 'SELECT'),
  'anonymous clients cannot read source payloads'
);

set local role anon;
select is(
  (select count(*) from public.artist_platform_profiles),
  1::bigint,
  'anonymous clients only see profiles for verified local artists'
);

select is(
  (select count(*) from public.artist_metric_snapshots),
  1::bigint,
  'anonymous clients see metrics from verified profiles'
);

select is(
  (select count(*) from public.artist_chart_career_stats),
  1::bigint,
  'anonymous clients only see career stats for verified local artists'
);

select * from finish();
rollback;
