begin;
select plan(4);
insert into artists (id, canonical_name, sort_name, source_key) values
  ('8a000000-0000-4000-8000-000000000001', 'Opozit', 'opozit', 'test:o1'),
  ('8a000000-0000-4000-8000-000000000002', 'Opozit', 'opozit', 'test:o2'),
  ('8a000000-0000-4000-8000-000000000003', 'Opozit', 'opozit', 'test:o3');
create temporary table g as select public.record_artist_proposal_group(array['8a000000-0000-4000-8000-000000000001','8a000000-0000-4000-8000-000000000002']::uuid[], 'review', null, null, '{}', '{"appleName":"Opozit"}') as id;
select isnt((select id from g), null, 'one proposal for a group of same-name records');
select is(public.record_artist_proposal_group(array['8a000000-0000-4000-8000-000000000003']::uuid[], 'review', null, null, '{}', '{"appleName":"Opozit"}'), (select id from g), 'a later same-name record joins the open proposal');
select is((select cardinality(also_apple_artist_ids) from artist_proposals where id = (select id from g)), 2, 'it covers all three records');
select function_privs_are('public', 'record_artist_proposal_group', array['uuid[]','text','uuid','text','uuid[]','jsonb'], 'authenticated', array[]::text[], 'only the service drafts proposals');
select * from finish();
rollback;
