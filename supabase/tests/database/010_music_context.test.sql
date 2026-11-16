begin;
select plan(40);

-- Vocabulary (D7) ------------------------------------------------------------
select is((select count(*)::integer from context_terms where status = 'active'), 39, 'D7 vocabulary is seeded: 15 genres, 14 themes, 4 scenes, 6 moods');
select is((select string_agg(dimension || ':' || n, ',' order by dimension) from (select dimension, count(*) n from context_terms group by dimension) x),
  'genre:15,mood:6,scene:4,theme:14', 'each dimension has its own list');
select is((select label_mn || ' / ' || label_en from context_terms where dimension = 'theme' and slug = 'homeland'), 'Эх орон / Homeland / Patriotism', 'labels are Mongolian and English');
select is((select max(version) from taxonomy_versions), 1, 'the seed is taxonomy version 1');

select function_privs_are('public', 'record_ai_tag_suggestions', array['text','text','jsonb'], 'authenticated', array[]::text[], 'AI suggestions come only from the server');
select function_privs_are('public', 'suggest_context_tag', array['text','uuid','uuid','text','text'], 'anon', array[]::text[], 'anonymous callers cannot tag');

-- Fixtures: one user per role.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', r || '@context.test', '', now(), '{}', '{}', now(), now()
from (values ('83000000-0000-4000-8000-0000000000a1'::uuid, 'administrator'), ('83000000-0000-4000-8000-0000000000a2'::uuid, 'editor'),
             ('83000000-0000-4000-8000-0000000000a3'::uuid, 'data_editor'), ('83000000-0000-4000-8000-0000000000a4'::uuid, 'writer')) u(id, r);
update profiles p set role = r::user_role from (values ('83000000-0000-4000-8000-0000000000a1'::uuid, 'administrator'), ('83000000-0000-4000-8000-0000000000a2'::uuid, 'editor'),
  ('83000000-0000-4000-8000-0000000000a3'::uuid, 'data_editor'), ('83000000-0000-4000-8000-0000000000a4'::uuid, 'writer')) u(id, r) where p.id = u.id;
insert into artists (id, canonical_name, sort_name) values ('83000000-0000-4000-8000-000000000001', 'Context Artist', 'Context Artist');
insert into songs (id, canonical_title, normalized_title, primary_artist_id) values ('83000000-0000-4000-8000-000000000011', 'Context Song', 'context song', '83000000-0000-4000-8000-000000000001');

create temporary table ids (k text primary key, v uuid);
grant all on ids to authenticated;
insert into ids select 'love', id from context_terms where dimension = 'theme' and slug = 'love';
insert into ids select 'pop', id from context_terms where dimension = 'genre' and slug = 'pop';
insert into ids select 'underground', id from context_terms where dimension = 'scene' and slug = 'underground';

-- Writers suggest; they cannot verify.
set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-0000000000a4', true);
select throws_ok($q$select public.suggest_context_tag('song', '83000000-0000-4000-8000-000000000011', (select v from ids where k = 'love'), null, 'short')$q$,
  'P0001', 'evidence is required: a source URL or a note of at least 10 characters', 'a suggestion needs evidence');
select lives_ok($q$insert into ids select 'loveTag', public.suggest_context_tag('song', '83000000-0000-4000-8000-000000000011', (select v from ids where k = 'love'), null, 'Listened: a song addressed to a partner')$q$,
  'a writer can suggest a theme');
select throws_ok($q$select public.review_context_tag('song', (select v from ids where k = 'loveTag'), 'verify', 'Writer approving own tag')$q$, 'P0001', 'forbidden', 'writers cannot verify');
select throws_ok($q$select public.suggest_context_tag('artist', '83000000-0000-4000-8000-000000000001', (select v from ids where k = 'underground'), 'https://example.com/interview', null)$q$,
  'P0001', 'forbidden', 'writers cannot label a scene (D9)');
select throws_ok($q$select public.suggest_context_tag('artist', '83000000-0000-4000-8000-000000000001', (select v from ids where k = 'love'), 'https://example.com', null)$q$,
  'P0001', 'term does not apply at this level', 'a song-level term cannot tag an artist');
reset role;

-- The public sees verified tags only.
set local role anon;
select is((select count(*)::integer from song_context_tags), 0, 'a suggested tag is not public');
reset role;

-- Data editors verify song tags; they cannot label a scene.
set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-0000000000a3', true);
select lives_ok($q$select public.review_context_tag('song', (select v from ids where k = 'loveTag'), 'verify', 'Listened to the full song myself')$q$, 'a data editor verifies a theme');
select throws_ok($q$select public.suggest_context_tag('artist', '83000000-0000-4000-8000-000000000001', (select v from ids where k = 'underground'), 'https://example.com/interview', null)$q$,
  'P0001', 'forbidden', 'data editors cannot label a scene (D9)');
select lives_ok($q$insert into ids select 'popTag', public.suggest_context_tag('song', '83000000-0000-4000-8000-000000000011', (select v from ids where k = 'pop'), 'https://music.apple.com/mn/song/1', null)$q$, 'a data editor suggests a genre with a URL');
select lives_ok($q$select public.review_context_tag('song', (select v from ids where k = 'popTag'), 'reject', 'Production is clearly rock, not pop')$q$, 'a data editor rejects a genre');

-- Editors label scenes, with evidence.
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-0000000000a2', true);
select lives_ok($q$insert into ids select 'sceneTag', public.suggest_context_tag('artist', '83000000-0000-4000-8000-000000000001', (select v from ids where k = 'underground'), 'https://example.com/interview', 'Self-released, no label, small venues')$q$, 'an editor suggests a scene');
select lives_ok($q$select public.review_context_tag('artist', (select v from ids where k = 'sceneTag'), 'verify', 'Confirmed with the artist''s own interview')$q$, 'an editor verifies a scene');
reset role;

set local role anon;
select is((select count(*)::integer from song_context_tags), 1, 'the public sees the verified theme only');
select is((select count(*)::integer from artist_context_tags), 1, 'the public sees the verified scene');
select throws_ok($q$select count(*) from song_source_genres$q$, '42501', null, 'source genres are staff-only');
reset role;

select is((select status::text from song_context_tags where id = (select v from ids where k = 'popTag')), 'unverified', 'a rejected tag is kept as unverified, not deleted');

-- Disputes: any staff member records one; the tag leaves the public view.
set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-0000000000a4', true);
select lives_ok($q$select public.review_context_tag('artist', (select v from ids where k = 'sceneTag'), 'dispute', 'Label emailed: the artist signed with them in 2026')$q$, 'a dispute is recorded');
reset role;
select is((select status::text from artist_context_tags where id = (select v from ids where k = 'sceneTag')), 'disputed', 'the scene label is disputed');
set local role anon;
select is((select count(*)::integer from artist_context_tags), 0, 'a disputed label is not public');
reset role;

select is((select count(*)::integer from audit_logs where action like 'context_tag.%' and entity_id in (select v::text from ids)), 7, 'every tag change is audited (3 suggestions, 2 verifications, 1 rejection, 1 dispute)');
select ok((select bool_and(reason is not null) from audit_logs where action like 'context_tag.%'), 'every audit row has a reason or evidence');

-- Taxonomy versioning.
set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-0000000000a2', true);
select lives_ok($q$insert into ids select 'newTerm', public.change_context_term('propose', 'Editors keep seeing this style', null, 'genre', 'mongol-trap', 'Монгол трап', 'Mongolian trap')$q$, 'an editor proposes a term');
select throws_ok($q$select public.change_context_term('approve', 'Editor approving own term', (select v from ids where k = 'newTerm'))$q$, 'P0001', 'forbidden', 'editors cannot approve terms');
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-0000000000a1', true);
select lives_ok($q$select public.change_context_term('approve', 'Seen on 12 chart songs this month', (select v from ids where k = 'newTerm'))$q$, 'an administrator approves it');
reset role;
select is((select status from context_terms where id = (select v from ids where k = 'newTerm')), 'active', 'the approved term is active');
select is((select string_agg(action, ',' order by version) from taxonomy_versions where version > 1), 'propose,approve', 'each change is a new taxonomy version');
select throws_ok($q$update taxonomy_versions set reason = 'x'$q$, 'P0001', 'taxonomy_versions is append-only', 'taxonomy history is immutable');

-- Source genres and their reviewed mapping.
insert into song_source_genres (song_id, source, value) values ('83000000-0000-4000-8000-000000000011', 'apple_music', 'Hip-Hop/Rap'), ('83000000-0000-4000-8000-000000000011', 'apple_music', 'Pop');
select is((select public.suggest_tags_from_source_genres()), 0, 'unreviewed mappings produce no suggestions');
set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-0000000000a3', true);
select lives_ok($q$select public.review_genre_mapping('apple_music', 'Hip-Hop/Rap', (select id from context_terms where dimension = 'genre' and slug = 'hip-hop'), true, 'Apple''s rap category is our hip-hop')$q$, 'a data editor verifies a mapping');
select throws_ok($q$select public.review_genre_mapping('apple_music', 'Pop', (select v from ids where k = 'love'), true, 'Mapping a genre onto a theme')$q$, 'P0001', 'source genres map to active genre terms only', 'a genre cannot map onto a theme');
reset role;
select is((select public.suggest_tags_from_source_genres()), 1, 'a verified mapping produces one suggestion');
select is((select t.status::text || '|' || t.source || '|' || t.evidence_note from song_context_tags t join context_terms c on c.id = t.term_id where c.slug = 'hip-hop'),
  'suggested|source_genre|Apple Music genre: Hip-Hop/Rap', 'it stays a suggestion and cites the source value');

-- AI suggestions.
select is((select public.record_ai_tag_suggestions('claude-haiku-5-5', 'tags-v1', '[{"songId":"83000000-0000-4000-8000-000000000011","dimension":"mood","term":"romantic","note":"From title and credits"},{"songId":"83000000-0000-4000-8000-000000000011","dimension":"scene","term":"underground"}]')), 1, 'AI suggests song-level terms only');
select is((select status::text || '|' || model || '|' || prompt_version from song_context_tags where source = 'ai'), 'suggested|claude-haiku-5-5|tags-v1', 'AI suggestions keep model and prompt version');

select * from finish();
rollback;
