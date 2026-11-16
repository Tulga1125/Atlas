begin;
select plan(12);

select function_privs_are('public', 'apply_artist_merge', array['uuid','uuid','text','uuid'], 'service_role', array[]::text[], 'the internal merge is not callable directly');
select function_privs_are('public', 'merge_artist_on_owner_instruction', array['uuid','uuid','text'], 'authenticated', array[]::text[], 'signed-in users cannot use the owner path');
select function_privs_are('public', 'merge_artist', array['uuid','uuid','text'], 'authenticated', array['EXECUTE'], 'administrators merge through merge_artist');

insert into artists (id, canonical_name, sort_name, source_key) values
  ('88000000-0000-4000-8000-000000000001', 'Gangaa', 'gangaa', 'test:a1'),
  ('88000000-0000-4000-8000-000000000002', 'Gangaa', 'gangaa', 'test:a2'),
  ('88000000-0000-4000-8000-000000000003', 'Band', 'band', 'test:band');
insert into songs (id, canonical_title, normalized_title, primary_artist_id) values
  ('88000000-0000-4000-8000-0000000000a1', 'One', 'one', '88000000-0000-4000-8000-000000000001'),
  ('88000000-0000-4000-8000-0000000000a2', 'Two', 'two', '88000000-0000-4000-8000-000000000002');
insert into song_artists (song_id, artist_id) values
  ('88000000-0000-4000-8000-0000000000a1', '88000000-0000-4000-8000-000000000001'),
  ('88000000-0000-4000-8000-0000000000a2', '88000000-0000-4000-8000-000000000002'),
  ('88000000-0000-4000-8000-0000000000a2', '88000000-0000-4000-8000-000000000001');

select throws_ok($q$select public.merge_artist_on_owner_instruction('88000000-0000-4000-8000-000000000002', '88000000-0000-4000-8000-000000000001', 'short')$q$,
  'P0001', 'a reason of at least 10 characters is required', 'a merge needs a reason');
select is((public.merge_artist_on_owner_instruction('88000000-0000-4000-8000-000000000002', '88000000-0000-4000-8000-000000000001',
  'Owner: these Apple credits are the same Gangaa')->'moved'->>'primarySongs'), '1', 'primary songs move to the target');
select is((select count(*)::integer from song_artists where artist_id = '88000000-0000-4000-8000-000000000001'), 2, 'credits move without duplicates');
select is((select redirect_to::text from artists where id = '88000000-0000-4000-8000-000000000002'), '88000000-0000-4000-8000-000000000001', 'the duplicate is redirected, not deleted');
select throws_ok($q$select public.merge_artist_on_owner_instruction('88000000-0000-4000-8000-000000000002', '88000000-0000-4000-8000-000000000003', 'Owner says merge again')$q$,
  'P0001', 'the source artist is already merged', 'a merged artist cannot be merged twice');
select is((select action from audit_logs where entity_id = '88000000-0000-4000-8000-000000000002' and action = 'artist.merged'), 'artist.merged', 'the merge is audited');

select isnt(public.set_artist_membership_on_owner_instruction('88000000-0000-4000-8000-000000000003', '88000000-0000-4000-8000-000000000001', 'member', 'Owner: Gangaa is a member of the band'), null, 'membership is recorded');
select throws_ok($q$select public.set_artist_membership_on_owner_instruction('88000000-0000-4000-8000-000000000003', '88000000-0000-4000-8000-000000000002', 'member', 'Owner: merged artist as a member')$q$,
  'P0001', 'use the merged target artist', 'a merged artist cannot become a member');
select isnt(public.record_owner_artist(null, 'Baynaa', 'person', 'Owner: Baynaa is a member of Gangbay', array['BAY']), null, 'an owner-stated artist is created verified');

select * from finish();
rollback;
