-- Owner-approved import of artists and their songs from their own YouTube
-- channels (16 November 2026: the owner approved 16 Mongolian hip-hop
-- channels found with the YouTube Data API).
--
-- * One call per artist, with that channel's raw API responses as source
--   evidence (a succeeded youtube_discovery job and its collection attempt).
-- * The artist and the channel link are verified by the owner's approval,
--   recorded as verification evidence with the reason given.
-- * Each song is created from one upload of the artist's own channel, so that
--   video is linked by construction (link_method 'source_import'). Other
--   uploads with the same title are linked as suggestions and wait for an
--   editor, exactly like the A2 auto-link rule.
-- * Existing artists, songs and reviewed video links are never overwritten.
--   Replaying the same evidence is a no-op.
--
-- Also: strip_title_noise ends "ft. X" at the next " - ", so
-- "A ft. B - Title" keeps its title (mirrors src/modules/catalog/match-title.ts).

alter table public.youtube_video_assets drop constraint youtube_video_assets_link_method_check;
alter table public.youtube_video_assets add constraint youtube_video_assets_link_method_check
  check (link_method in ('editor', 'auto_verified_channel_title', 'source_import'));

create or replace function public.strip_title_noise(p_title text) returns text
language plpgsql immutable parallel safe set search_path = '' as $$
declare
  w constant text := 'a-z0-9À-ɏа-яёөү';
  noise constant text := 'official music video|official lyric video|official video|official audio|official mv|official|music video|lyric video|lyrics video|lyrics|lyric|visualizer|visualiser|audio|video|m/v|mv|hd|4k|клип|дууны үг|албан ёсны|live|концерт';
  s text := translate(coalesce(p_title, ''), 'ABCDEFGHIJKLMNOPQRSTUVWXYZАБВГДЕЁЖЗИЙКЛМНОӨПРСТУҮФХЦЧШЩЪЫЬЭЮЯ',
                                             'abcdefghijklmnopqrstuvwxyzабвгдеёжзийклмноөпрстуүфхцчшщъыьэюя');
  i integer;
begin
  s := regexp_replace(s, '\s[|｜]\s.*$', '');
  s := regexp_replace(s, '[(\[【「][^)\]】」]*(?<![' || w || '])(?:' || noise || ')(?![' || w || '])[^)\]】」]*[)\]】」]', ' ', 'g');
  select string_agg(regexp_replace(part, '\s*[(\[]?\s*(?<![a-z0-9_])(?:ft|feat|featuring)(?![a-z0-9_])\.?\s.*$', ''), ' - ' order by n)
    into s from regexp_split_to_table(s, '\s+[-–—]\s+') with ordinality x(part, n);
  for i in 1..4 loop
    s := regexp_replace(coalesce(s, ''), '\s*[-–—|:]?\s*(?<![' || w || '])(?:' || noise || ')(?![' || w || '])\s*$', '');
  end loop;
  return trim(regexp_replace(s, '\s+', ' ', 'g'));
end $$;

create function public.import_youtube_artist_catalog(p_reason text, p_source_url text, p_raw_body text, p_checksum text, p_artist jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c_youtube constant uuid := '00000000-0000-0000-0000-000000000002';
  v_channel text := p_artist->>'channelId';
  v_name text := trim(p_artist->>'name');
  v_key text;
  v_job uuid;
  v_token uuid := gen_random_uuid();
  v_attempt uuid;
  v_artist uuid;
  v_new_artist boolean := false;
  v_song uuid;
  v_recording uuid;
  v_asset uuid;
  v_kind youtube_asset_kind;
  s jsonb;
  v jsonb;
  r jsonb;
  a text;
  v_counts jsonb := '{"songsCreated":0,"songsExisting":0,"videosLinked":0,"videosSuggested":0,"videosKept":0}';
begin
  if coalesce(length(trim(p_reason)), 0) not between 10 and 2000 then raise exception 'a reason of at least 10 characters is required'; end if;
  if v_channel is null or v_channel !~ '^UC[A-Za-z0-9_-]{22}$' then raise exception 'invalid channel id'; end if;
  if coalesce(length(v_name), 0) not between 1 and 200 then raise exception 'invalid artist name'; end if;
  if p_source_url ~* '[?&]key=' then raise exception 'source URL must not contain the API key'; end if;
  if p_raw_body is null or p_checksum is distinct from encode(sha256(convert_to(p_raw_body, 'UTF8')), 'hex') then
    raise exception 'checksum does not match the source evidence';
  end if;
  if jsonb_typeof(p_artist->'songs') <> 'array' or jsonb_array_length(p_artist->'songs') > 2000 then raise exception 'invalid song list'; end if;

  v_key := 'youtube:artist-import:' || v_channel || ':' || p_checksum;
  select id into v_job from pipeline_jobs where idempotency_key = v_key;
  if found then
    return jsonb_build_object('jobId', v_job, 'outcome', 'already_imported');
  end if;

  insert into pipeline_jobs (kind, business_date, idempotency_key, status, attempts, lease_token, reason, completed_at)
  values ('youtube_discovery', (now() at time zone 'Asia/Ulaanbaatar')::date, v_key, 'succeeded', 1, v_token, trim(p_reason), now())
  returning id into v_job;
  insert into collection_attempts (job_id, attempt_number, lease_token, source_url, http_status, raw_body, checksum)
  values (v_job, 1, v_token, p_source_url, 200, p_raw_body, p_checksum)
  returning id into v_attempt;

  -- Artist: reuse whoever already owns the channel; otherwise create.
  select artist_id into v_artist from artist_platform_profiles where platform_id = c_youtube and platform_artist_id = v_channel;
  if v_artist is null then
    insert into artists (canonical_name, sort_name, source_key, country_code, locality, verification)
    values (v_name, normalize_catalog_text(v_name), 'youtube:' || v_channel, 'MN', 'local', 'verified')
    on conflict (source_key) do update set updated_at = artists.updated_at
    returning id, (xmax = 0) into v_artist, v_new_artist;
    insert into artist_platform_profiles (artist_id, platform_id, platform_artist_id, profile_url, is_primary, match_status, match_method, metadata)
    values (v_artist, c_youtube, v_channel, 'https://www.youtube.com/channel/' || v_channel,
            not exists (select 1 from artist_platform_profiles where artist_id = v_artist and platform_id = c_youtube and is_primary),
            'verified', 'manual', jsonb_build_object('label', coalesce((p_artist->>'isLabel')::boolean, false), 'approval', 'owner', 'jobId', v_job));
    insert into artist_verification_evidence (artist_id, evidence_type, source_url, payload, supports_locality, supports_country_code, notes, verified_at)
    values (v_artist, 'manual', 'https://www.youtube.com/channel/' || v_channel,
            jsonb_build_object('channelId', v_channel, 'jobId', v_job, 'label', coalesce((p_artist->>'isLabel')::boolean, false)),
            'local', 'MN', trim(p_reason), now());
  end if;
  for a in select jsonb_array_elements_text(coalesce(p_artist->'aliases', '[]')) loop
    if length(trim(a)) between 1 and 200 then
      insert into artist_aliases (artist_id, alias, normalized_alias, platform_id)
      values (v_artist, trim(a), normalize_catalog_text(a), c_youtube) on conflict do nothing;
    end if;
  end loop;

  for s in select * from jsonb_array_elements(p_artist->'songs') loop
    if coalesce(length(trim(s->>'title')), 0) not between 1 and 240 then raise exception 'invalid song title'; end if;
    if s->>'credit' not in ('primary', 'featured') then raise exception 'invalid credit'; end if;
    v := null;
    select x.value into v from jsonb_array_elements(s->'videos') x where x.value->>'role' = 'source' limit 1;
    if v is null then raise exception 'song without a source video'; end if;

    select id into v_song from songs where source_key = 'youtube:' || (v->>'videoId');
    if v_song is null then
      insert into songs (canonical_title, normalized_title, source_key, primary_artist_id, release_date, locality, verification)
      values (trim(s->>'title'), normalize_catalog_text(s->>'title'), 'youtube:' || (v->>'videoId'),
              case when s->>'credit' = 'primary' then v_artist end, (s->>'releaseDate')::date, 'local',
              case when v->>'suggestedKind' in ('official_music_video', 'official_audio', 'lyric_video') then 'verified' else 'suggested' end::verification_status)
      returning id into v_song;
      insert into song_artists (song_id, artist_id, credit_role, credit_order) values (v_song, v_artist, s->>'credit', 0);
      insert into recordings (song_id, release_date, recording_type) values (v_song, (s->>'releaseDate')::date, 'original')
      returning id into v_recording;
      v_counts := jsonb_set(v_counts, '{songsCreated}', to_jsonb((v_counts->>'songsCreated')::integer + 1));
    else
      select id into v_recording from recordings where song_id = v_song order by (recording_type = 'original') desc, created_at, id limit 1;
      v_counts := jsonb_set(v_counts, '{songsExisting}', to_jsonb((v_counts->>'songsExisting')::integer + 1));
    end if;

    for v in select * from jsonb_array_elements(s->'videos') loop
      if v->>'channelId' is distinct from v_channel then raise exception 'video from another channel'; end if;
      r := upsert_youtube_candidate(v - 'role', 'channel_uploads', v_attempt);
      v_asset := (r->>'assetId')::uuid;
      -- Leave alone anything an editor (or an earlier import) already decided.
      if exists (select 1 from youtube_video_assets where platform_asset_id = v_asset
                 and (link_method in ('editor', 'source_import') or link_status = 'rejected')) then
        v_counts := jsonb_set(v_counts, '{videosKept}', to_jsonb((v_counts->>'videosKept')::integer + 1));
        continue;
      end if;
      v_kind := coalesce(nullif(v->>'suggestedKind', '')::youtube_asset_kind, 'other');
      update platform_assets set recording_id = v_recording where id = v_asset;
      if v->>'role' = 'source' then
        update youtube_video_assets
          set link_status = 'linked', verification = 'verified', link_method = 'source_import', linked_at = now(),
              asset_kind = v_kind, is_primary = v_kind in ('official_music_video', 'official_audio', 'lyric_video')
                and not exists (select 1 from youtube_video_assets y2 join platform_assets p2 on p2.id = y2.platform_asset_id
                                where p2.recording_id = v_recording and y2.is_primary and y2.platform_asset_id <> v_asset),
              updated_at = now()
          where platform_asset_id = v_asset;
        update entity_match_reviews set status = 'linked', suggested_recording_id = v_recording, reviewed_at = now()
          where platform_asset_id = v_asset and status = 'open';
        v_counts := jsonb_set(v_counts, '{videosLinked}', to_jsonb((v_counts->>'videosLinked')::integer + 1));
      else
        update youtube_video_assets
          set link_status = 'linked', verification = 'suggested', link_method = 'auto_verified_channel_title', linked_at = now(),
              asset_kind = v_kind, is_primary = false, updated_at = now()
          where platform_asset_id = v_asset;
        update entity_match_reviews set suggested_recording_id = v_recording
          where platform_asset_id = v_asset and status = 'open';
        v_counts := jsonb_set(v_counts, '{videosSuggested}', to_jsonb((v_counts->>'videosSuggested')::integer + 1));
      end if;
      insert into youtube_watchlist (platform_asset_id, reason, discovery_source)
      values (v_asset, case when v->>'role' = 'source' then 'Song imported from the artist''s own channel (owner-approved)'
                            else 'Same title on the artist''s own channel; awaiting editor confirmation' end, 'channel_uploads')
      on conflict (platform_asset_id) do nothing;
    end loop;
  end loop;

  insert into audit_logs (action, entity_type, entity_id, after_data, reason)
  values ('youtube_artist.imported', 'artist', v_artist::text,
          v_counts || jsonb_build_object('channelId', v_channel, 'jobId', v_job, 'newArtist', v_new_artist), trim(p_reason));
  return v_counts || jsonb_build_object('artistId', v_artist, 'jobId', v_job, 'newArtist', v_new_artist, 'outcome', 'imported');
end $$;
revoke all on function public.import_youtube_artist_catalog(text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.import_youtube_artist_catalog(text, text, text, text, jsonb) to service_role;
