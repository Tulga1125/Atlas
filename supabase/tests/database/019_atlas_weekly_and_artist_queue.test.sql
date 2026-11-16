begin;
select plan(9);

select ok(exists (select 1 from methodology_configuration where code = 'atlas-mn-weekly-v1' and (parameters->>'appleWeight')::numeric = 0.6), 'the weekly formula is versioned configuration');
select function_privs_are('public', 'record_artist_proposal', array['uuid','text','uuid','text','uuid[]','jsonb'], 'authenticated', array[]::text[], 'only the service drafts proposals');
select function_privs_are('public', 'decide_artist_proposal', array['uuid','text','text'], 'authenticated', array['EXECUTE'], 'staff decide proposals');

insert into artists (id, canonical_name, sort_name, source_key) values
  ('89000000-0000-4000-8000-000000000001', 'Newname', 'newname', 'test:new'),
  ('89000000-0000-4000-8000-000000000002', 'Known', 'known', 'test:known');
select isnt(public.record_artist_proposal('89000000-0000-4000-8000-000000000001', 'merge', '89000000-0000-4000-8000-000000000002', null, '{}', '{"appleName":"Newname"}'), null, 'a proposal is recorded');
select is(public.record_artist_proposal('89000000-0000-4000-8000-000000000001', 'merge', '89000000-0000-4000-8000-000000000002', null, '{}', '{"appleName":"Newname"}'), null, 'only one open proposal per artist');
select throws_ok($q$select public.record_artist_proposal('89000000-0000-4000-8000-000000000002', 'merge', null, null, '{}', '{}')$q$, '23514', null, 'a merge proposal needs a target');

-- An analyst cannot decide; a data editor can reject.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '89000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'queue-analyst@atlas.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '89000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'queue-editor@atlas.test', '', now(), '{}', '{}', now(), now());
update profiles set role = 'data_editor' where id = '89000000-0000-4000-8000-0000000000a2';
create temporary table pid as select id from artist_proposals where apple_artist_id = '89000000-0000-4000-8000-000000000001';
grant select on pid to authenticated;
set local role authenticated;
set local request.jwt.claim.sub = '89000000-0000-4000-8000-0000000000a1';
select throws_ok($q$select public.decide_artist_proposal((select id from pid), 'reject', '')$q$, 'P0001', 'forbidden', 'an analyst cannot decide');
set local request.jwt.claim.sub = '89000000-0000-4000-8000-0000000000a2';
select lives_ok($q$select public.decide_artist_proposal((select id from pid), 'reject', 'not this one')$q$, 'a data editor rejects');
reset role;
select is((select status from artist_proposals where apple_artist_id = '89000000-0000-4000-8000-000000000001'), 'rejected', 'the proposal is closed and audited');

select * from finish();
rollback;
