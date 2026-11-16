begin;
select plan(14);

select has_function(
  'public',
  'review_artist_identity',
  array[
    'uuid',
    'text',
    'text',
    'text',
    'locality',
    'verification_status',
    'text',
    'text',
    'text',
    'text',
    'text'
  ],
  'atomic artist review function exists'
);

select function_privs_are(
  'public',
  'review_artist_identity',
  array[
    'uuid',
    'text',
    'text',
    'text',
    'locality',
    'verification_status',
    'text',
    'text',
    'text',
    'text',
    'text'
  ],
  'authenticated',
  array['EXECUTE'],
  'authenticated users can invoke the role-gated review function'
);

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
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '70000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'reviewer@atlas.mn',
    '',
    now(),
    '{}'::jsonb,
    '{"display_name":"Artist Reviewer"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '70000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'analyst@atlas.mn',
    '',
    now(),
    '{}'::jsonb,
    '{"display_name":"Atlas Analyst"}'::jsonb,
    now(),
    now()
  );

update public.profiles
set role = 'data_editor'
where id = '70000000-0000-4000-8000-000000000001';

insert into public.artists (
  id,
  canonical_name,
  sort_name,
  source_key,
  locality,
  verification
) values
  (
    '71000000-0000-4000-8000-000000000001',
    'Review Candidate',
    'review candidate',
    'test:review-candidate',
    'unknown',
    'suggested'
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    'Second Candidate',
    'second candidate',
    'test:second-candidate',
    'unknown',
    'suggested'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $$select public.review_artist_identity(
    '71000000-0000-4000-8000-000000000001',
    'Reviewed Artist',
    'group',
    'mn',
    'local',
    'verified',
    'official_profile',
    'https://example.com/reviewed-artist',
    'Official artist profile confirms Mongolian identity',
    'UC1234567890123456789012',
    null
  )$$,
  'a data editor can complete an evidence-backed review'
);

select is(
  (select canonical_name from public.artists where id = '71000000-0000-4000-8000-000000000001'),
  'Reviewed Artist',
  'the canonical artist name is updated'
);

select is(
  (select country_code from public.artists where id = '71000000-0000-4000-8000-000000000001'),
  'MN',
  'country code is normalized to uppercase'
);

select is(
  (select locality::text || ':' || verification::text from public.artists where id = '71000000-0000-4000-8000-000000000001'),
  'local:verified',
  'the reviewed artist is verified as local'
);

select is(
  (select reviewed_by from public.artist_verification_evidence where artist_id = '71000000-0000-4000-8000-000000000001'),
  '70000000-0000-4000-8000-000000000001'::uuid,
  'verification evidence records the reviewer'
);

select is(
  (select platform_artist_id from public.artist_platform_profiles where artist_id = '71000000-0000-4000-8000-000000000001'),
  'UC1234567890123456789012',
  'the exact YouTube channel ID is linked'
);

reset role;

select is(
  (select action from public.audit_logs where entity_id = '71000000-0000-4000-8000-000000000001'),
  'artist_identity_reviewed',
  'the review writes an audit event'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000001',
  true
);

select throws_ok(
  $$select public.review_artist_identity(
    '71000000-0000-4000-8000-000000000002',
    'Second Candidate',
    'project',
    'MN',
    'local',
    'verified',
    null,
    null,
    null,
    null,
    null
  )$$,
  'verified local artists require verification evidence',
  'local verification cannot be completed without evidence'
);

select throws_ok(
  $$select public.review_artist_identity(
    '71000000-0000-4000-8000-000000000002',
    'Second Candidate',
    'project',
    null,
    'unknown',
    'suggested',
    'manual',
    'javascript:alert(1)',
    null,
    null,
    null
  )$$,
  'artist evidence URL must use HTTP or HTTPS',
  'unsafe evidence URL schemes are rejected'
);

select throws_ok(
  $$select public.review_artist_identity(
    '71000000-0000-4000-8000-000000000002',
    'Second Candidate',
    'project',
    'MN',
    'local',
    'suggested',
    'manual',
    null,
    'Review notes',
    'UC1234567890123456789012',
    null
  )$$,
  'YouTube channel is already linked to another artist',
  'one YouTube channel cannot be assigned to two artists'
);

select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000002',
  true
);

select throws_ok(
  $$select public.review_artist_identity(
    '71000000-0000-4000-8000-000000000002',
    'Second Candidate',
    'project',
    null,
    'unknown',
    'suggested',
    null,
    null,
    null,
    null,
    null
  )$$,
  'artist review requires administrator or data_editor role',
  'analysts cannot review artist identities'
);

select ok(
  not has_function_privilege('anon', 'public.review_artist_identity(uuid,text,text,text,locality,verification_status,text,text,text,text,text)', 'EXECUTE'),
  'anonymous users cannot invoke artist reviews'
);

select * from finish();
rollback;
