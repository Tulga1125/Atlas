begin;
select plan(13);

select function_privs_are('public', 'import_youtube_artist_catalog', array['text','text','text','text','jsonb'], 'authenticated', array[]::text[], 'signed-in users cannot import');
select function_privs_are('public', 'import_youtube_artist_catalog', array['text','text','text','text','jsonb'], 'service_role', array['EXECUTE'], 'the service role imports');
select is(public.strip_title_noise('ThunderZ ft. Ninjin - Kiss Me (Official Music Video)'), 'thunderz - kiss me', '"A ft. B - Title" keeps its title');
select is(public.video_title_key('Desant - How Deep (feat. Jason) [Official Music Video]', array['Desant']), public.match_title_key('How Deep'), 'a featured credit before the title is dropped');

create temporary table body as select '{"responses":[]}'::text as raw;
create temporary table artist as select $j${
  "name": "Test Rapper", "channelId": "UCtesttesttesttesttest01", "aliases": ["TR"], "isLabel": false,
  "songs": [
    {"title": "Kiss Me", "credit": "primary", "releaseDate": "2024-11-18", "videos": [
      {"videoId": "aaaaaaaaaa1", "channelId": "UCtesttesttesttesttest01", "channelTitle": "TEST", "title": "Test Rapper - Kiss Me (Official Music Video)",
       "publishedAt": "2024-11-18T10:00:00Z", "durationSeconds": 200, "isShort": false, "suggestedKind": "official_music_video", "role": "source"},
      {"videoId": "aaaaaaaaaa2", "channelId": "UCtesttesttesttesttest01", "channelTitle": "TEST", "title": "Test Rapper - Kiss Me (Lyric Video)",
       "publishedAt": "2024-12-01T10:00:00Z", "durationSeconds": 200, "isShort": false, "suggestedKind": "lyric_video", "role": "version"}]},
    {"title": "Tatar", "credit": "featured", "releaseDate": "2025-02-01", "videos": [
      {"videoId": "aaaaaaaaaa3", "channelId": "UCtesttesttesttesttest01", "channelTitle": "TEST", "title": "Other - Tatar ft Test Rapper",
       "publishedAt": "2025-02-01T10:00:00Z", "durationSeconds": 210, "isShort": false, "suggestedKind": "other", "role": "source"}]}
  ]}$j$::jsonb as a;

select throws_ok($q$select public.import_youtube_artist_catalog('Owner approved this channel', 'https://www.googleapis.com/youtube/v3/x', raw, 'bad', a) from body, artist$q$,
  'P0001', 'checksum does not match the source evidence', 'evidence must match its checksum');

create temporary table result as
  select public.import_youtube_artist_catalog('Owner approved this channel in chat', 'https://www.googleapis.com/youtube/v3/playlistItems', raw,
         encode(sha256(convert_to(raw, 'UTF8')), 'hex'), a) as r from body, artist;

select is((select r->>'songsCreated' || '|' || (r->>'videosLinked') || '|' || (r->>'videosSuggested') from result), '2|2|1', 'two songs, two source links, one suggestion');
select is((select verification::text || '|' || locality::text || '|' || country_code from artists where source_key = 'youtube:UCtesttesttesttesttest01'),
  'verified|local|MN', 'the owner-approved artist is verified and local');
select is((select match_status::text from artist_platform_profiles where platform_artist_id = 'UCtesttesttesttesttest01'), 'verified', 'the channel is a verified profile');
select is((select string_agg(s.canonical_title || ':' || s.verification::text || ':' || coalesce(sa.credit_role, '-') || ':' || (s.primary_artist_id is not null)::text, ',' order by s.canonical_title)
  from songs s join song_artists sa on sa.song_id = s.id where s.source_key like 'youtube:aaaaaaaaaa%'),
  'Kiss Me:verified:primary:true,Tatar:suggested:featured:false', 'songs keep their credit; a non-official upload stays suggested');
select is((select string_agg(y.video_id || ':' || y.link_method || ':' || y.verification::text || ':' || y.is_primary::text, ',' order by y.video_id)
  from youtube_video_assets y where y.video_id like 'aaaaaaaaaa%'),
  'aaaaaaaaaa1:source_import:verified:true,aaaaaaaaaa2:auto_verified_channel_title:suggested:false,aaaaaaaaaa3:source_import:verified:false',
  'the source video is linked; another version waits for an editor');
select is((select count(*)::integer from youtube_watchlist w join youtube_video_assets y using (platform_asset_id) where y.video_id like 'aaaaaaaaaa%' and w.active), 3,
  'linked videos are watched for daily statistics');
select is((select public.import_youtube_artist_catalog('Owner approved this channel in chat', 'https://www.googleapis.com/youtube/v3/playlistItems', raw,
         encode(sha256(convert_to(raw, 'UTF8')), 'hex'), a)->>'outcome' from body, artist), 'already_imported', 'replaying the same evidence is a no-op');
select is((select count(*)::integer from songs where source_key like 'youtube:aaaaaaaaaa%'), 2, 'no duplicate songs');

select * from finish();
rollback;
