begin;
select plan(61);

-- Privileges -------------------------------------------------------------------
select function_privs_are('public', 'record_youtube_candidates', array['uuid','uuid','uuid','youtube_discovery_source','jsonb'], 'authenticated', array[]::text[], 'staff cannot write discovery results directly');
select function_privs_are('public', 'record_youtube_candidates', array['uuid','uuid','uuid','youtube_discovery_source','jsonb'], 'service_role', array['EXECUTE'], 'worker records candidates');
select function_privs_are('public', 'upsert_youtube_candidate', array['jsonb','youtube_discovery_source','uuid'], 'service_role', array[]::text[], 'candidate upsert is internal only');
select function_privs_are('public', 'review_youtube_video', array['uuid','text','text','uuid','youtube_asset_kind'], 'anon', array[]::text[], 'anonymous callers cannot review videos');
select function_privs_are('public', 'record_manual_youtube_video', array['uuid','text','text','integer','text','text','jsonb'], 'authenticated', array[]::text[], 'manual entry goes through the server, which fetches the video');

-- Title keys: identical to src/modules/catalog/match-title.ts ------------------
select is(public.match_title_key('Хайртай'), 'hairtai', 'Cyrillic key matches the TypeScript key');
select is(public.match_title_key('Khairtai'), 'hairtai', 'formal Latin folds to the same key');
select is(public.match_title_key('  ХАЙРТАЙ!! '), 'hairtai', 'case and punctuation are ignored without relying on server locale');
select is(public.match_title_key('Uuliin salhi'), public.match_title_key('Уулын салхи'), 'Uuliin salhi ≡ Уулын салхи');
select is(public.match_title_key('Цагаан сар'), 'cagansar', 'ц folds like Latin ts');
select is(public.match_title_key('Zhargal'), public.match_title_key('Жаргал'), 'Zhargal ≡ Жаргал');
select is(public.match_title_key('Öglöö'), 'oglo', 'Latin diacritics fold like ө');
select is(public.match_title_key('Chi mini'), public.match_title_key('Чи минь'), 'Chi mini ≡ Чи минь');
select is(public.match_title_key('Юүве юүве юү'), 'uveuveu', 'ю and ү fold like Yuve');
select is(public.match_title_key('Khökh tenger'), 'hohtenger', 'Khökh tenger ≡ Хөх тэнгэр');
select is(public.match_title_key('Ёс') || '|' || public.match_title_key('Йог'), 'es|iog', 'decomposed ё and й match TypeScript');
select is(
  (select string_agg(public.match_title_key(public.strip_title_noise(t)), ',' order by n) from unnest(array[
    'Хайртай (Official Music Video)', 'Хайртай [Official MV] 4K', 'Хайртай | Official MV 4K', 'Хайртай клип',
    'Хайртай (Дууны үг)', 'Хайртай (feat. Someone)', 'Хайртай - Official Audio']) with ordinality x(t, n)),
  'hairtai,hairtai,hairtai,hairtai,hairtai,hairtai,hairtai', 'upload noise is removed in both scripts');
select is(public.match_title_key(public.strip_title_noise('Live in Ulaanbaatar')), 'liveinulanbatar', 'a title that is only noise-like at the start is kept');
select is(
  public.video_title_key('The HU - Yuve Yuve Yu (Official Music Video)', array['The HU']) || ',' ||
  public.video_title_key('Хайртай - Саран', array['Saran']) || ',' ||
  public.video_title_key('Saran x Bold - Ээж', array['Болд']) || ',' ||
  public.video_title_key('Other Artist - Ээж', array['Saran']),
  'uveuveu,hairtai,ej,otherartistej', 'artist credits are dropped only for a known artist');

-- Fixtures -------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '82000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'yt-editor@atlas.test', '', now(), '{}', '{"display_name":"Data Editor"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '82000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'yt-writer@atlas.test', '', now(), '{}', '{"display_name":"Writer"}', now(), now());
update profiles set role = 'data_editor' where id = '82000000-0000-4000-8000-0000000000a1';
update profiles set role = 'writer' where id = '82000000-0000-4000-8000-0000000000a2';

insert into artists (id, canonical_name, sort_name, verification) values ('82000000-0000-4000-8000-000000000001', 'Saran', 'Saran', 'verified');
insert into artist_platform_profiles (artist_id, platform_id, platform_artist_id, match_status, match_method)
values ('82000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000002', 'UCverifiedchannel0000001', 'verified', 'manual');
insert into songs (id, canonical_title, normalized_title, primary_artist_id) values
  ('82000000-0000-4000-8000-000000000011', 'Хайртай', 'хайртай', '82000000-0000-4000-8000-000000000001'),
  ('82000000-0000-4000-8000-000000000012', 'Ээж', 'ээж', '82000000-0000-4000-8000-000000000001');
insert into song_artists (song_id, artist_id) values
  ('82000000-0000-4000-8000-000000000011', '82000000-0000-4000-8000-000000000001'),
  ('82000000-0000-4000-8000-000000000012', '82000000-0000-4000-8000-000000000001');
insert into recordings (id, song_id) values
  ('82000000-0000-4000-8000-000000000021', '82000000-0000-4000-8000-000000000011'),
  ('82000000-0000-4000-8000-000000000022', '82000000-0000-4000-8000-000000000012');
insert into platform_assets (platform_id, platform_item_id, platform_artist_name, platform_title)
values ('00000000-0000-0000-0000-000000000001', 'apple-yt-test', 'Saran', 'Хайртай');
insert into pipeline_jobs (id, kind, business_date, idempotency_key, status, attempts, lease_token, lease_until) values
  ('82000000-0000-4000-8000-000000000031', 'youtube_discovery', current_date, 'test:youtube:discovery', 'running', 1, '82000000-0000-4000-8000-000000000032', now() + interval '5 minutes');
insert into collection_attempts (id, job_id, attempt_number, lease_token, source_url, http_status, raw_body, checksum) values
  ('82000000-0000-4000-8000-000000000033', '82000000-0000-4000-8000-000000000031', 1, '82000000-0000-4000-8000-000000000032',
   'https://www.googleapis.com/youtube/v3/playlistItems?playlistId=UUverifiedchannel0000001', 200, '{"items":[]}', 'sha-discovery');

select is((select retention_class::text from collection_attempts where id = '82000000-0000-4000-8000-000000000033'), 'youtube_metadata', 'discovery responses fall under YouTube retention');

-- Discovery ----------------------------------------------------------------------
create temporary table batch as select public.record_youtube_candidates(
  '82000000-0000-4000-8000-000000000031', '82000000-0000-4000-8000-000000000032', '82000000-0000-4000-8000-000000000033', 'channel_uploads',
  '[{"videoId":"vidAutoLnk1","channelId":"UCverifiedchannel0000001","channelTitle":"Saran","title":"Saran - Khairtai (Official MV)","publishedAt":"2026-11-01T10:00:00Z","durationSeconds":201,"suggestedKind":"official_music_video","thumbnailUrl":"https://i.ytimg.com/vi/vidAutoLnk1/hqdefault.jpg"},
    {"videoId":"vidUnverif2","channelId":"UCunverifiedchannel00002","channelTitle":"Fan uploads","title":"Хайртай","durationSeconds":199,"suggestedKind":"other"},
    {"videoId":"vidNoMatch3","channelId":"UCverifiedchannel0000001","channelTitle":"Saran","title":"Behind the scenes","durationSeconds":45,"isShort":true,"suggestedKind":"other"},
    {"videoId":"vidPartial4","channelId":"UCverifiedchannel0000001","channelTitle":"Saran","title":"Хайртай 2","durationSeconds":210}]'::jsonb) as counts;
select is((select counts from batch), '{"new": 4, "refreshed": 0, "suggested": 2, "unmatched": 1, "auto_linked": 1}'::jsonb, 'discovery reports what it found');

select is((select link_status::text || '/' || verification::text || '/' || link_method from youtube_video_assets where video_id = 'vidAutoLnk1'),
  'linked/suggested/auto_verified_channel_title', 'verified channel + exact title auto-links, but only as a suggestion');
select is((select recording_id from platform_assets where platform_item_id = 'vidAutoLnk1'), '82000000-0000-4000-8000-000000000021'::uuid, 'auto-link points at the song''s recording');
select is((select asset_kind::text from youtube_video_assets where video_id = 'vidAutoLnk1'), 'official_music_video', 'suggested kind is applied');
select ok((select active from youtube_watchlist w join youtube_video_assets y using (platform_asset_id) where y.video_id = 'vidAutoLnk1'), 'auto-linked video is collected daily');
select ok((select status = 'open' and (evidence->>'autoLinked')::boolean from entity_match_reviews m join youtube_video_assets y on y.platform_asset_id = m.platform_asset_id where y.video_id = 'vidAutoLnk1'), 'auto-link still waits in the review queue');

select is((select link_status::text from youtube_video_assets where video_id = 'vidUnverif2'), 'candidate', 'an unverified channel never auto-links, even with an exact title');
select is((select suggested_recording_id::text || '@' || confidence::text from entity_match_reviews m join youtube_video_assets y on y.platform_asset_id = m.platform_asset_id where y.video_id = 'vidUnverif2'),
  '82000000-0000-4000-8000-000000000021@0.500', 'unverified exact title is only a suggestion');
select is((select suggested_recording_id from entity_match_reviews m join youtube_video_assets y on y.platform_asset_id = m.platform_asset_id where y.video_id = 'vidNoMatch3'), null, 'no song is suggested when nothing matches');
select is((select evidence->>'titleMatch' || '@' || confidence::text from entity_match_reviews m join youtube_video_assets y on y.platform_asset_id = m.platform_asset_id where y.video_id = 'vidPartial4'), 'partial@0.400', 'partial title match is suggested with low confidence');
select ok((select is_short from youtube_video_assets where video_id = 'vidNoMatch3'), 'Short estimate is stored');
select ok((select bool_and(not (evidence::text like '%Хайртай%' or evidence::text like '%Khairtai%')) from entity_match_reviews where evidence->>'rule' = 'youtube-catalog-v1'), 'review evidence holds no YouTube titles');

-- No duplicates.
create temporary table again as select public.record_youtube_candidates(
  '82000000-0000-4000-8000-000000000031', '82000000-0000-4000-8000-000000000032', '82000000-0000-4000-8000-000000000033', 'channel_uploads',
  '[{"videoId":"vidAutoLnk1","channelId":"UCverifiedchannel0000001","channelTitle":"Saran","title":"Saran - Khairtai (Official MV)","durationSeconds":201}]'::jsonb) as counts;
select is((select (counts->>'refreshed')::integer from again), 1, 'a known video is refreshed, not duplicated');
select is((select count(*)::integer from youtube_video_assets where video_id = 'vidAutoLnk1'), 1, 'one row per video ID');
select is((select count(*)::integer from entity_match_reviews m join youtube_video_assets y on y.platform_asset_id = m.platform_asset_id where y.video_id = 'vidAutoLnk1'), 1, 'refresh does not reopen review');
select throws_ok($q$insert into youtube_video_assets (platform_asset_id, video_id, channel_id, discovery_source) select id, 'vidAutoLnk1', 'UCverifiedchannel0000001', 'manual' from platform_assets where platform_item_id = 'apple-yt-test'$q$, '23505', null, 'the database rejects duplicate video IDs');
select throws_ok($q$select public.record_youtube_candidates('82000000-0000-4000-8000-000000000031', gen_random_uuid(), '82000000-0000-4000-8000-000000000033', 'channel_uploads', '[]')$q$, 'P0001', 'lost job lease', 'a worker without the lease cannot write');
select throws_ok($q$select public.record_youtube_candidates('82000000-0000-4000-8000-000000000031', '82000000-0000-4000-8000-000000000032', '82000000-0000-4000-8000-000000000033', 'channel_uploads', '[{"videoId":"bad","channelId":"UCverifiedchannel0000001","title":"x"}]')$q$, 'P0001', 'invalid video id', 'malformed video IDs are rejected');

-- Public access (D3: dashboard only).
set local role anon;
select is((select count(*)::integer from platform_assets where platform_id = '00000000-0000-0000-0000-000000000002'), 0, 'the public cannot read YouTube assets');
select is((select count(*)::integer from platform_assets where platform_item_id = 'apple-yt-test'), 1, 'the public still reads Apple assets');
select throws_ok($q$select count(*) from youtube_video_assets$q$, '42501', null, 'the public cannot read the video catalogue');
reset role;

-- Writers cannot link.
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-0000000000a2', true);
select is((select count(*)::integer from youtube_video_assets), 4, 'staff can read the catalogue');
select throws_ok($q$select public.review_youtube_video((select platform_asset_id from youtube_video_assets where video_id = 'vidUnverif2'), 'link', 'Writer trying to link a video', '82000000-0000-4000-8000-000000000021')$q$, 'P0001', 'forbidden', 'writers cannot link videos');

-- Data editors review.
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-0000000000a1', true);
select throws_ok($q$select public.review_youtube_video((select platform_asset_id from youtube_video_assets where video_id = 'vidUnverif2'), 'link', 'short', '82000000-0000-4000-8000-000000000021')$q$, 'P0001', 'a reason of at least 10 characters is required', 'every action needs a reason');
select lives_ok($q$select public.review_youtube_video((select platform_asset_id from youtube_video_assets where video_id = 'vidUnverif2'), 'link', 'Artist confirmed this fan channel re-upload in writing', '82000000-0000-4000-8000-000000000021', 'other')$q$, 'a data editor links a video');
select lives_ok($q$select public.review_youtube_video((select platform_asset_id from youtube_video_assets where video_id = 'vidAutoLnk1'), 'confirm', 'Checked the official channel and the video')$q$, 'a data editor confirms an auto-link');
select lives_ok($q$select public.review_youtube_video((select platform_asset_id from youtube_video_assets where video_id = 'vidAutoLnk1'), 'primary', 'Official video is the main asset for the song')$q$, 'a confirmed link can become primary');
select lives_ok($q$select public.review_youtube_video((select platform_asset_id from youtube_video_assets where video_id = 'vidNoMatch3'), 'reject', 'Behind-the-scenes clip, not a song')$q$, 'a data editor rejects a video');
reset role;

select is((select link_status::text || '/' || verification::text || '/' || link_method from youtube_video_assets where video_id = 'vidUnverif2'), 'linked/verified/editor', 'editor link is verified');
select is((select verification::text || '/' || is_primary::text from youtube_video_assets where video_id = 'vidAutoLnk1'), 'verified/true', 'confirmed auto-link is verified and primary');
select is((select link_status::text from youtube_video_assets where video_id = 'vidNoMatch3'), 'rejected', 'rejected video stays catalogued as rejected');
select is((select count(*)::integer from entity_match_reviews m join youtube_video_assets y on y.platform_asset_id = m.platform_asset_id where y.video_id in ('vidUnverif2', 'vidAutoLnk1', 'vidNoMatch3') and m.status = 'open'), 0, 'reviews are closed by the decisions');
select is((select count(*)::integer from audit_logs where action in ('youtube_video.link', 'youtube_video.confirm', 'youtube_video.primary', 'youtube_video.reject') and actor_user_id = '82000000-0000-4000-8000-0000000000a1'), 4, 'each review action is audited with its editor');
select ok((select bool_and(not (before_data ? 'published_at') and not (after_data ? 'duration_seconds') and after_data ? 'recordingId') from audit_logs where action like 'youtube_video.%' and actor_user_id is not null), 'audit rows keep the link, not YouTube metadata');

-- Manual entry.
select throws_ok($q$select public.record_manual_youtube_video('82000000-0000-4000-8000-0000000000a2', 'Writer pasting a link', 'https://www.googleapis.com/youtube/v3/videos?id=vidManual05', 200, '{}', 'sha', '{"videoId":"vidManual05","channelId":"UCverifiedchannel0000001","title":"Ээж"}')$q$, 'P0001', 'forbidden', 'writers cannot add videos manually');
select throws_ok($q$select public.record_manual_youtube_video('82000000-0000-4000-8000-0000000000a1', 'Editor pasting a link', 'https://www.googleapis.com/youtube/v3/videos?id=vidManual05&key=SECRET', 200, '{}', 'sha', '{"videoId":"vidManual05","channelId":"UCverifiedchannel0000001","title":"Ээж"}')$q$, 'P0001', 'source URL must not contain the API key', 'the API key never reaches stored evidence');
select is((select public.record_manual_youtube_video('82000000-0000-4000-8000-0000000000a1', 'Editor pasting a link from the label', 'https://www.googleapis.com/youtube/v3/videos?id=vidManual05', 200, '{}', 'sha-manual',
  '{"videoId":"vidManual05","channelId":"UCverifiedchannel0000001","channelTitle":"Saran","title":"Saran - Ээж (Official Audio)","suggestedKind":"official_audio"}')->>'outcome'), 'auto_linked', 'manual entry follows the same linking rule');

-- Retention clears video metadata after 30 days without a refresh; links stay.
select is((select (public.apply_youtube_retention(now() + interval '40 days')->'counts'->>'youtubeVideoMetadata')::integer), 5, 'stale video metadata is cleared');
select is((select platform_title || '|' || platform_artist_name || '|' || coalesce(artwork_url, '-') from platform_assets where platform_item_id = 'vidAutoLnk1'),
  'vidAutoLnk1|UCverifiedchannel0000001|-', 'title, channel name and thumbnail are replaced by IDs');
select is((select coalesce(published_at::text, '-') || '|' || coalesce(duration_seconds::text, '-') || '|' || link_status::text from youtube_video_assets where video_id = 'vidAutoLnk1'), '-|-|linked', 'publish date and duration are cleared; the link remains');
select is((select recording_id from platform_assets where platform_item_id = 'vidAutoLnk1'), '82000000-0000-4000-8000-000000000021'::uuid, 'retention never touches the editor''s link');

select * from finish();
rollback;
