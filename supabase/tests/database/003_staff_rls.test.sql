begin;
select plan(5);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '50000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'staff@atlas.mn',
  '',
  now(),
  '{}'::jsonb,
  '{"display_name":"Staff Editor"}'::jsonb,
  now(),
  now()
);

insert into public.collection_jobs (
  id,
  chart_id,
  idempotency_key,
  scheduled_for,
  status
) values (
  '51000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  'staff-rls-fixture',
  now(),
  'succeeded'
);

insert into public.raw_payloads (
  id,
  collection_job_id,
  source_url,
  checksum,
  payload
) values (
  '52000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  'https://example.com/staff-rls-fixture',
  repeat('b', 64),
  '{}'::jsonb
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
  '53000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  '51000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000001',
  '1900-08-20',
  now(),
  0,
  'approved',
  repeat('b', 64),
  true,
  now()
);

insert into public.signals (
  id,
  signal_type,
  chart_id,
  snapshot_id,
  severity,
  confidence,
  headline_summary,
  rule_version
) values (
  '54000000-0000-4000-8000-000000000001',
  'staff_rls_fixture',
  '00000000-0000-0000-0000-000000000010',
  '53000000-0000-4000-8000-000000000001',
  'medium',
  1,
  'RLS fixture signal',
  'test-v1'
);

alter table public.chart_snapshots enable trigger snapshot_protection;
alter table public.chart_entries enable trigger chart_entries_approved_immutable;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '50000000-0000-4000-8000-000000000001',
  true
);

select is(
  (select count(*) from public.profiles where id='50000000-0000-4000-8000-000000000001'),
  1::bigint,
  'a staff member can read their own profile'
);
select is(
  (select count(*) from public.signals where id='54000000-0000-4000-8000-000000000001'),
  1::bigint,
  'an active staff member can read newsroom signals'
);
select is(
  (select count(*) from public.collection_jobs where id='51000000-0000-4000-8000-000000000001'),
  1::bigint,
  'an active staff member can read collection health'
);

reset role;
update public.profiles
set active = false
where id = '50000000-0000-4000-8000-000000000001';

set local role authenticated;
select is(
  (select count(*) from public.signals where id='54000000-0000-4000-8000-000000000001'),
  0::bigint,
  'an inactive staff member cannot read newsroom signals'
);
select is(
  (select count(*) from public.collection_jobs where id='51000000-0000-4000-8000-000000000001'),
  0::bigint,
  'an inactive staff member cannot read collection health'
);

select * from finish();
rollback;
