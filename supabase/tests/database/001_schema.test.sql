begin;
select plan(25);

select has_table('public', 'chart_snapshots', 'chart_snapshots exists');
select has_table('public', 'chart_entries', 'chart_entries exists');
select has_table('public', 'raw_payloads', 'raw_payloads exists');
select has_table('public', 'platform_assets', 'platform_assets exists');
select has_table('public', 'signals', 'signals exists');
select has_table('public', 'story_leads', 'story_leads exists');
select col_is_pk('public', 'chart_snapshots', 'id', 'snapshot ID is the primary key');
select col_is_fk('public', 'chart_entries', 'snapshot_id', 'entries belong to snapshots');
select col_is_fk('public', 'chart_entries', 'song_id', 'entries resolve to canonical songs');
select has_function(
  'public',
  'ingest_apple_music_snapshot',
  array['uuid', 'date', 'timestamp with time zone', 'text', 'text', 'jsonb', 'jsonb'],
  'atomic Apple Music ingestion function exists'
);
select policies_are(
  'public',
  'chart_snapshots',
  array['public reads approved snapshots'],
  'only the approved-snapshot read policy is exposed'
);
select policies_are(
  'public',
  'chart_entries',
  array['public reads approved chart entries'],
  'only approved chart entries are exposed'
);

select ok(
  has_table_privilege('anon', 'public.chart_snapshots', 'SELECT'),
  'anonymous clients can query approved snapshots through RLS'
);
select ok(
  has_table_privilege('anon', 'public.chart_entries', 'SELECT'),
  'anonymous clients can query approved entries through RLS'
);
select ok(
  not has_table_privilege('anon', 'public.signals', 'SELECT'),
  'anonymous clients cannot read newsroom signals'
);
select ok(
  has_table_privilege('authenticated', 'public.signals', 'SELECT'),
  'authenticated staff can query newsroom signals through RLS'
);
select ok(
  not has_table_privilege('anon', 'public.raw_payloads', 'SELECT'),
  'anonymous clients cannot query raw source payloads'
);
select ok(
  has_table_privilege('authenticated', 'public.raw_payloads', 'SELECT'),
  'staff clients can inspect raw evidence through role-gated RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.audit_logs', 'SELECT'),
  'staff clients can inspect audit history through role-gated RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.collection_jobs', 'SELECT'),
  'authenticated staff can query collection health through RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.calculation_runs', 'SELECT'),
  'authenticated staff can query calculation health through RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.entity_match_reviews', 'SELECT'),
  'authenticated staff can query identity review counts through RLS'
);
select policies_are(
  'public',
  'collection_jobs',
  array['staff reads collection jobs'],
  'collection jobs are restricted to active staff'
);
select policies_are(
  'public',
  'calculation_runs',
  array['staff reads calculation runs'],
  'calculation runs are restricted to active staff'
);
select policies_are(
  'public',
  'entity_match_reviews',
  array['staff reads entity match reviews'],
  'identity reviews are restricted to active staff'
);

select * from finish();
rollback;
