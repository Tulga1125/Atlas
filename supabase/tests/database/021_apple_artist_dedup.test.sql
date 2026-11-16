begin;
select plan(7);
select is(public.split_artist_credit('Fruitybaachka & Bektor Petrovic'), array['Fruitybaachka','Bektor Petrovic'], 'joint credits split');
select is(public.split_artist_credit('Ginjin x B Tamir'), array['Ginjin','B Tamir'], 'x credits split');
insert into artists (id, canonical_name, sort_name, source_key, verification, locality, country_code, created_at) values
  ('8b000000-0000-4000-8000-000000000001', 'Gangaa', 'gangaa', 'test:g-verified', 'verified', 'local', 'MN', now()),
  ('8b000000-0000-4000-8000-000000000002', 'Gangaa', 'gangaa', 'test:g-apple', 'suggested', 'unknown', null, now() - interval '1 day'),
  ('8b000000-0000-4000-8000-000000000003', 'B Tamir', 'b tamir', 'test:bt', 'verified', 'local', 'MN', now()),
  ('8b000000-0000-4000-8000-000000000004', 'Old', 'old', 'test:old', 'suggested', 'unknown', null, now());
update artists set redirect_to = '8b000000-0000-4000-8000-000000000001' where id = '8b000000-0000-4000-8000-000000000004';
insert into artist_aliases (artist_id, alias, normalized_alias) values ('8b000000-0000-4000-8000-000000000003', 'B.Tamir', normalize_catalog_text('B.Tamir'));
select is(public.match_existing_artist('Gangaa'), '8b000000-0000-4000-8000-000000000001'::uuid, 'the verified Mongolian artist wins over an older Apple record');
select is(public.match_existing_artist('B.Tamir'), '8b000000-0000-4000-8000-000000000003'::uuid, 'aliases match');
select is(public.match_existing_artist('B Tamir & Somebody New'), '8b000000-0000-4000-8000-000000000003'::uuid, 'a joint credit uses its first known artist');
select is(public.match_existing_artist('Nobody Here'), null, 'an unknown name creates a new artist');
select is(public.resolve_artist('8b000000-0000-4000-8000-000000000004'), '8b000000-0000-4000-8000-000000000001'::uuid, 'merged records resolve to their target');
select * from finish();
rollback;
