begin;
select plan(8);

insert into public.collection_jobs (
  id,
  chart_id,
  idempotency_key,
  scheduled_for,
  status
) values (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  'test:apple_music:mn:1901-08-19',
  '1901-08-19T06:00:00+08:00',
  'queued'
);

create temporary table ingestion_result (snapshot_id uuid);

insert into ingestion_result
select public.ingest_apple_music_snapshot(
  '10000000-0000-0000-0000-000000000001',
  '1901-08-19',
  null,
  repeat('a', 64),
  'https://api.music.apple.com/v1/catalog/mn/charts',
  '{"fixture":true}'::jsonb,
  (
    select jsonb_agg(
      jsonb_build_object(
        'rank', rank,
        'itemId', 'apple-' || rank,
        'title', 'Fixture Song ' || rank,
        'artistName', 'Fixture Artist ' || rank,
        'artistId', 'artist-' || rank,
        'albumName', 'Fixture Album',
        'url', 'https://music.apple.com/mn/song/' || rank,
        'isrc', 'MNAAA26' || lpad(rank::text, 5, '0'),
        'durationMs', 180000,
        'releaseDate', '1901-08-01',
        'contentRating', null,
        'primaryGenre', 'Pop',
        'artworkUrl', 'https://example.com/' || rank || '.jpg'
      )
      order by rank
    )
    from generate_series(1, 100) rank
  )
);

select is(
  (select status::text from public.chart_snapshots where id = (select snapshot_id from ingestion_result)),
  'approved',
  'the snapshot is approved atomically'
);

select is(
  (select entry_count from public.chart_snapshots where id = (select snapshot_id from ingestion_result)),
  100,
  'the approved snapshot records 100 entries'
);

select is(
  (select count(*)::integer from public.chart_entries where snapshot_id = (select snapshot_id from ingestion_result)),
  100,
  'all 100 chart entries are retained'
);

select is(
  (select status::text from public.collection_jobs where id = '10000000-0000-0000-0000-000000000001'),
  'succeeded',
  'the collection job succeeds with the transaction'
);

select is(
  (select count(*)::integer from public.raw_payloads where collection_job_id = '10000000-0000-0000-0000-000000000001'),
  1,
  'the untouched source payload is retained'
);

select is(
  (select entry_status::text from public.chart_entries where snapshot_id = (select snapshot_id from ingestion_result) and rank = 1),
  'new',
  'a first-time chart entry is marked new'
);

select is(
  (select count(*)::integer from public.signals where snapshot_id = (select snapshot_id from ingestion_result)),
  10,
  'the first No. 1 and Top 10 entries produce evidence-backed signals'
);

select throws_ok(
  $$delete from public.chart_entries where snapshot_id = (select snapshot_id from ingestion_result) and rank = 1$$,
  'entries belonging to an approved snapshot are immutable',
  'approved chart entries cannot be deleted'
);

select * from finish();
rollback;
