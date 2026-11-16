begin;
select plan(4);
insert into artists (id, canonical_name, sort_name, source_key, verification, locality, country_code) values
  ('8c000000-0000-4000-8000-000000000001', 'Singer', 'singer', 'test:singer', 'verified', 'local', 'MN'),
  ('8c000000-0000-4000-8000-000000000002', 'Rapper', 'rapper', 'test:rapper', 'verified', 'local', 'MN');
create temporary table body as select '{"responses":[]}'::text raw;
create temporary table a as select
  ('{"name":"Singer","channelId":"UClabellabellabellabel01","aliases":[],"isLabel":true,"artistId":"8c000000-0000-4000-8000-000000000001","songs":[{"title":"One","credit":"primary","releaseDate":"2024-01-01","videos":[{"videoId":"bbbbbbbbbb1","channelId":"UClabellabellabellabel01","channelTitle":"Label","title":"Singer - One (MV)","publishedAt":"2024-01-01T00:00:00Z","durationSeconds":200,"isShort":false,"suggestedKind":"official_music_video","role":"source"}]}]}')::jsonb s1,
  ('{"name":"Rapper","channelId":"UClabellabellabellabel01","aliases":[],"isLabel":true,"artistId":"8c000000-0000-4000-8000-000000000002","songs":[{"title":"Two","credit":"primary","releaseDate":"2024-02-01","videos":[{"videoId":"bbbbbbbbbb2","channelId":"UClabellabellabellabel01","channelTitle":"Label","title":"Rapper - Two (MV)","publishedAt":"2024-02-01T00:00:00Z","durationSeconds":200,"isShort":false,"suggestedKind":"official_music_video","role":"source"}]}]}')::jsonb s2;
select is((select public.import_youtube_artist_catalog('Owner: label channel import', 'https://www.googleapis.com/youtube/v3/x', raw, encode(sha256(convert_to(raw,'UTF8')),'hex'), s1)->>'artistId' from body, a), '8c000000-0000-4000-8000-000000000001', 'the first artist on a label channel gets its song');
select is((select public.import_youtube_artist_catalog('Owner: label channel import', 'https://www.googleapis.com/youtube/v3/x', raw, encode(sha256(convert_to(raw,'UTF8')),'hex'), s2)->>'artistId' from body, a), '8c000000-0000-4000-8000-000000000002', 'a second artist on the same label channel gets theirs');
select is((select count(*)::integer from artist_platform_profiles where platform_artist_id = 'UClabellabellabellabel01'), 0, 'no single artist claims the label channel');
select is((select count(*)::integer from artist_verification_evidence where evidence_type = 'label' and payload->>'channelId' = 'UClabellabellabellabel01'), 2, 'the label is recorded as evidence for each artist');
select * from finish();
rollback;
