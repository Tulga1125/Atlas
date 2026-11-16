-- A2: YouTube video catalogue and song linking.
--
-- A reviewed list of which YouTube videos represent which Atlas songs.
-- * Every video is a platform_assets row (platform youtube) plus a
--   youtube_video_assets row with the YouTube-specific facts. Videos link to
--   a recording, so canonical merges and splits carry them along.
-- * Discovery only creates candidates. The database auto-links only when the
--   video comes from a verified channel of a credited artist AND the
--   normalised title matches exactly one of that artist's songs; even then
--   the link stays "suggested" until a data editor confirms it.
-- * Titles, channel names, thumbnails, publish dates and durations are
--   youtube_metadata: the retention job clears them after 30 days without a
--   refresh. IDs, kinds, links and review decisions are Atlas data.
-- * Dashboard only (owner decision D3): the public cannot read YouTube assets.

create type public.youtube_asset_kind as enum ('official_music_video', 'official_audio', 'lyric_video', 'live', 'other');
create type public.youtube_link_status as enum ('candidate', 'linked', 'rejected');
create type public.youtube_discovery_source as enum ('channel_uploads', 'chart_search', 'manual', 'most_popular_mn');

alter table public.pipeline_jobs drop constraint pipeline_jobs_kind_check;
alter table public.pipeline_jobs add constraint pipeline_jobs_kind_check
  check (kind in ('collect', 'calculate', 'artists', 'youtube_retention', 'youtube_discovery'));

create table public.youtube_video_assets (
  platform_asset_id uuid primary key references public.platform_assets(id),
  video_id text not null unique check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  channel_id text not null check (channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
  asset_kind public.youtube_asset_kind,
  suggested_kind public.youtube_asset_kind,
  -- youtube_metadata: cleared by the retention job when not refreshed.
  published_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  metadata_refreshed_at timestamptz,
  metadata_purged_at timestamptz,
  -- Atlas data.
  is_short boolean not null default false,
  link_status public.youtube_link_status not null default 'candidate',
  verification public.verification_status not null default 'unverified',
  link_method text check (link_method in ('editor', 'auto_verified_channel_title')),
  linked_by uuid references public.profiles(id),
  linked_at timestamptz,
  is_primary boolean not null default false,
  discovery_source public.youtube_discovery_source not null,
  discovery_attempt_id uuid references public.collection_attempts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (link_status = 'linked' or not is_primary),
  check (link_status <> 'linked' or (link_method is not null and linked_at is not null))
);
create index youtube_video_assets_review_idx on public.youtube_video_assets (link_status, verification, created_at desc);
create index youtube_video_assets_channel_idx on public.youtube_video_assets (channel_id);

create table public.youtube_watchlist (
  platform_asset_id uuid primary key references public.youtube_video_assets(platform_asset_id),
  active boolean not null default true,
  reason text not null check (length(trim(reason)) between 3 and 2000),
  discovery_source public.youtube_discovery_source not null,
  added_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index youtube_watchlist_active_idx on public.youtube_watchlist (platform_asset_id) where active;

create table public.youtube_search_tasks (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id),
  business_date date not null,
  query text not null check (length(query) between 1 and 300),
  channel_id text check (channel_id is null or channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
  status text not null default 'queued' check (status in ('queued', 'searched', 'failed', 'skipped')),
  job_id uuid references public.pipeline_jobs(id),
  quota_units integer not null default 0 check (quota_units >= 0),
  results integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (song_id, business_date)
);

insert into public.methodology_versions (code, title, notes, effective_from)
values ('youtube-catalog-v1', 'YouTube catalogue linking v1',
  'Videos are candidates until a data editor links them. Auto-link only when the uploading channel is verified for a credited artist and the normalised title (Cyrillic and Latin folded together, upload noise removed) matches exactly one of that artist''s songs; auto-links stay suggested until confirmed. Search is capped per day.',
  '2026-11-16')
on conflict (code) do nothing;
insert into public.methodology_configuration (code, parameters)
values ('youtube-catalog-v1', '{"searchDailyCap": 20, "searchRepeatDays": 30, "uploadsPerChannel": 50}')
on conflict (code) do nothing;

-- Privacy and access ---------------------------------------------------------

alter table public.youtube_video_assets enable row level security;
alter table public.youtube_watchlist enable row level security;
alter table public.youtube_search_tasks enable row level security;
create policy "staff reads youtube video assets" on public.youtube_video_assets
  for select to authenticated using (public.staff_role() is not null);
create policy "staff reads youtube watchlist" on public.youtube_watchlist
  for select to authenticated using (public.staff_role() is not null);
create policy "staff reads youtube search tasks" on public.youtube_search_tasks
  for select to authenticated using (public.staff_role() is not null);
grant select on public.youtube_video_assets, public.youtube_watchlist, public.youtube_search_tasks to authenticated;

-- D3: YouTube assets are dashboard-only. Two policies so anonymous callers
-- never evaluate staff_role(), which they may not execute.
drop policy "public reads platform assets" on public.platform_assets;
create policy "public reads non-youtube platform assets" on public.platform_assets
  for select to anon, authenticated using (platform_id <> '00000000-0000-0000-0000-000000000002');
create policy "staff reads youtube platform assets" on public.platform_assets
  for select to authenticated using (public.staff_role() is not null);

-- Title matching (mirror of src/modules/catalog/match-title.ts) ---------------
-- Locale-independent on purpose: lower() and [[:alnum:]] depend on the
-- server's collation, so letters are mapped explicitly.

create function public.match_title_key(p_value text) returns text
language plpgsql immutable parallel safe set search_path = '' as $$
declare s text := normalize(coalesce(p_value, ''), NFKD);
begin
  s := translate(s, 'ABCDEFGHIJKLMNOPQRSTUVWXYZАБВГДЕЁЖЗИЙКЛМНОӨПРСТУҮФХЦЧШЩЪЫЬЭЮЯ',
                    'abcdefghijklmnopqrstuvwxyzабвгдеёжзийклмноөпрстуүфхцчшщъыьэюя');
  s := regexp_replace(s, '[̀-ͯ]', '', 'g');
  s := replace(replace(replace(replace(replace(replace(replace(replace(s,
         'ц', 'ts'), 'ч', 'ch'), 'ш', 'sh'), 'щ', 'sh'), 'ю', 'yu'), 'я', 'ya'), 'ё', 'yo'), 'ъ', '');
  s := translate(s, 'абвгдежзийклмноөпрстуүфхыьэ', 'abvgdejziiklmnooprstuufhiie');
  s := replace(replace(replace(s, 'kh', 'h'), 'zh', 'j'), 'ts', 'c');
  s := regexp_replace(s, 'y([aeiou])', '\1', 'g');
  s := translate(s, 'ywqx', 'ivkh');
  s := regexp_replace(s, '[^a-z0-9]', '', 'g');
  s := regexp_replace(s, '(.)\1+', '\1', 'g');
  return s;
end $$;

create function public.strip_title_noise(p_title text) returns text
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
  s := regexp_replace(s, '\s*[(\[]?\s*(?<![a-z0-9_])(?:ft|feat|featuring)(?![a-z0-9_])\.?\s.*$', '');
  for i in 1..4 loop
    s := regexp_replace(s, '\s*[-–—|:]?\s*(?<![' || w || '])(?:' || noise || ')(?![' || w || '])\s*$', '');
  end loop;
  return trim(regexp_replace(s, '\s+', ' ', 'g'));
end $$;

create function public.video_title_key(p_title text, p_artists text[]) returns text
language plpgsql immutable parallel safe set search_path = '' as $$
declare
  w constant text := 'a-z0-9À-ɏа-яёөү';
  cleaned text := public.strip_title_noise(p_title);
  parts text[] := regexp_split_to_array(cleaned, '\s+[-–—]\s+');
  artists text[];
  credit text;
begin
  select coalesce(array_agg(k), '{}') into artists
  from (select public.match_title_key(a) k from unnest(coalesce(p_artists, '{}')) a) x where k <> '';
  if array_length(parts, 1) = 2 then
    foreach credit in array regexp_split_to_array(parts[1], '\s*(?:,|&|×|(?<![' || w || '])(?:x|and|ба)(?![' || w || ']))\s*') loop
      if public.match_title_key(credit) <> '' and public.match_title_key(credit) = any(artists) then
        return public.match_title_key(parts[2]);
      end if;
    end loop;
    foreach credit in array regexp_split_to_array(parts[2], '\s*(?:,|&|×|(?<![' || w || '])(?:x|and|ба)(?![' || w || ']))\s*') loop
      if public.match_title_key(credit) <> '' and public.match_title_key(credit) = any(artists) then
        return public.match_title_key(parts[1]);
      end if;
    end loop;
  end if;
  return public.match_title_key(cleaned);
end $$;

-- Song suggestion -------------------------------------------------------------
-- Returns the best song for a video, how it matched and whether the rule
-- allows an automatic (still unconfirmed) link.
create function public.suggest_youtube_song(p_asset uuid)
returns table (song_id uuid, recording_id uuid, title_match text, confidence numeric, auto_link boolean, verified_channel boolean, candidates integer)
language plpgsql stable security definer set search_path = public as $$
declare
  v_channel text;
  v_channel_title text;
  v_title text;
  v_artists uuid[];
  v_names text[];
  v_key text;
  v_exact uuid[];
  v_partial uuid[];
  v_song uuid;
begin
  select y.channel_id, pa.platform_artist_name, pa.platform_title into v_channel, v_channel_title, v_title
  from youtube_video_assets y join platform_assets pa on pa.id = y.platform_asset_id
  where y.platform_asset_id = p_asset;
  if not found then raise exception 'video not found'; end if;

  select coalesce(array_agg(distinct app.artist_id), '{}') into v_artists
  from artist_platform_profiles app
  where app.platform_id = '00000000-0000-0000-0000-000000000002'
    and app.platform_artist_id = v_channel and app.match_status = 'verified';

  select coalesce(array_agg(n), '{}') || array[v_channel_title] into v_names from (
    select a.canonical_name n from artists a where a.id = any(v_artists)
    union select al.alias from artist_aliases al where al.artist_id = any(v_artists)
  ) x;
  v_key := video_title_key(v_title, v_names);
  if v_key = '' then
    return query select null::uuid, null::uuid, 'none'::text, null::numeric, false, cardinality(v_artists) > 0, 0;
    return;
  end if;

  -- Songs that can be suggested: credited to the channel's verified artist,
  -- or (exact title only) any active song when the channel is not verified.
  with titles as (
    select s.id, match_title_key(strip_title_noise(t.title)) k,
           exists (select 1 from song_artists sa where sa.song_id = s.id and sa.artist_id = any(v_artists)) credited
    from songs s
    cross join lateral (select s.canonical_title title union all select alias from song_aliases where song_aliases.song_id = s.id) t
    where s.redirect_to is null and exists (select 1 from recordings r where r.song_id = s.id)
  )
  select coalesce(array_agg(distinct id) filter (where k = v_key and (credited or cardinality(v_artists) = 0)), '{}'),
         coalesce(array_agg(distinct id) filter (where credited and k <> v_key and least(length(k), length(v_key)) >= 4
                                                  and (position(k in v_key) > 0 or position(v_key in k) > 0)), '{}')
  into v_exact, v_partial
  from titles;

  if cardinality(v_exact) > 0 then
    v_song := v_exact[1];
    return query select v_song,
      (select r.id from recordings r where r.song_id = v_song order by (r.recording_type = 'original') desc, r.release_date nulls last, r.created_at, r.id limit 1),
      'exact'::text,
      case when cardinality(v_artists) > 0 and cardinality(v_exact) = 1 then 0.95
           when cardinality(v_artists) > 0 then 0.6 else 0.5 end::numeric,
      cardinality(v_artists) > 0 and cardinality(v_exact) = 1,
      cardinality(v_artists) > 0,
      cardinality(v_exact);
  elsif cardinality(v_partial) > 0 then
    v_song := v_partial[1];
    return query select v_song,
      (select r.id from recordings r where r.song_id = v_song order by (r.recording_type = 'original') desc, r.release_date nulls last, r.created_at, r.id limit 1),
      'partial'::text, (case when cardinality(v_partial) = 1 then 0.4 else 0.25 end)::numeric, false, true, cardinality(v_partial);
  else
    return query select null::uuid, null::uuid, 'none'::text, null::numeric, false, cardinality(v_artists) > 0, 0;
  end if;
end $$;
revoke all on function public.suggest_youtube_song(uuid) from public, anon;
grant execute on function public.suggest_youtube_song(uuid) to authenticated, service_role;

-- Candidate upsert (internal; called by the two service functions below) ------
create function public.upsert_youtube_candidate(p_video jsonb, p_source public.youtube_discovery_source, p_attempt uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id text := p_video->>'videoId';
  v_channel text := p_video->>'channelId';
  v_title text := trim(p_video->>'title');
  v_channel_title text := coalesce(nullif(trim(p_video->>'channelTitle'), ''), v_channel);
  v_duration integer := (p_video->>'durationSeconds')::integer;
  v_kind youtube_asset_kind := nullif(p_video->>'suggestedKind', '')::youtube_asset_kind;
  v_asset uuid;
  v_new boolean;
  v_row youtube_video_assets;
  s record;
begin
  if v_id is null or v_id !~ '^[A-Za-z0-9_-]{11}$' then raise exception 'invalid video id'; end if;
  if v_channel is null or v_channel !~ '^UC[A-Za-z0-9_-]{22}$' then raise exception 'invalid channel id'; end if;
  if coalesce(length(v_title), 0) not between 1 and 500 or length(v_channel_title) > 200 then raise exception 'invalid video metadata'; end if;
  if v_duration is not null and v_duration < 0 then raise exception 'invalid duration'; end if;
  if p_video ? 'thumbnailUrl' and p_video->>'thumbnailUrl' !~ '^https://i[0-9]?\.ytimg\.com/' then raise exception 'invalid thumbnail'; end if;

  insert into platform_assets (platform_id, platform_item_id, platform_url, platform_artist_id, platform_artist_name, platform_title, artwork_url, duration_ms)
  values ('00000000-0000-0000-0000-000000000002', v_id, 'https://www.youtube.com/watch?v=' || v_id, v_channel, v_channel_title, v_title,
          p_video->>'thumbnailUrl', v_duration * 1000)
  on conflict (platform_id, platform_item_id) do update
    set platform_title = excluded.platform_title, platform_artist_name = excluded.platform_artist_name,
        artwork_url = excluded.artwork_url, duration_ms = excluded.duration_ms, last_seen_at = now()
  returning id, (xmax = 0) into v_asset, v_new;

  insert into youtube_video_assets (platform_asset_id, video_id, channel_id, suggested_kind, published_at, duration_seconds,
                                    is_short, metadata_refreshed_at, discovery_source, discovery_attempt_id)
  values (v_asset, v_id, v_channel, v_kind, (p_video->>'publishedAt')::timestamptz, v_duration,
          coalesce((p_video->>'isShort')::boolean, false), now(), p_source, p_attempt)
  on conflict (platform_asset_id) do update
    set published_at = excluded.published_at, duration_seconds = excluded.duration_seconds, is_short = excluded.is_short,
        metadata_refreshed_at = now(), metadata_purged_at = null,
        suggested_kind = case when youtube_video_assets.link_status = 'candidate' then excluded.suggested_kind else youtube_video_assets.suggested_kind end,
        updated_at = now()
  returning * into v_row;
  if v_row.channel_id <> v_channel then raise exception 'video channel changed'; end if;

  if not v_new then
    return jsonb_build_object('assetId', v_asset, 'outcome', 'refreshed');
  end if;

  select * into s from suggest_youtube_song(v_asset);
  if s.auto_link then
    update platform_assets set recording_id = s.recording_id where id = v_asset;
    update youtube_video_assets
      set link_status = 'linked', verification = 'suggested', link_method = 'auto_verified_channel_title',
          linked_at = now(), asset_kind = coalesce(v_kind, 'other'), updated_at = now()
      where platform_asset_id = v_asset;
    insert into youtube_watchlist (platform_asset_id, reason, discovery_source)
    values (v_asset, 'Auto-linked from a verified artist channel; awaiting editor confirmation', p_source)
    on conflict (platform_asset_id) do nothing;
  end if;
  insert into entity_match_reviews (platform_asset_id, suggested_recording_id, confidence, evidence)
  values (v_asset, s.recording_id, s.confidence, jsonb_build_object(
    'rule', 'youtube-catalog-v1', 'titleMatch', s.title_match, 'verifiedChannel', s.verified_channel,
    'candidateSongs', s.candidates, 'autoLinked', s.auto_link, 'suggestedSongId', s.song_id, 'source', p_source));
  insert into audit_logs (action, entity_type, entity_id, after_data, reason)
  values (case when s.auto_link then 'youtube_video.auto_linked' else 'youtube_video.discovered' end,
          'youtube_video_asset', v_asset::text,
          jsonb_build_object('videoId', v_id, 'channelId', v_channel, 'source', p_source, 'titleMatch', s.title_match,
                             'verifiedChannel', s.verified_channel, 'recordingId', case when s.auto_link then s.recording_id end),
          case when s.auto_link then 'Verified artist channel and exact normalised title; editor confirmation pending'
               else 'Discovered as a candidate; no link without editor review' end);
  return jsonb_build_object('assetId', v_asset,
    'outcome', case when s.auto_link then 'auto_linked' when s.song_id is not null then 'suggested' else 'unmatched' end);
end $$;
revoke all on function public.upsert_youtube_candidate(jsonb, public.youtube_discovery_source, uuid) from public, anon, authenticated, service_role;

-- Worker: candidates from one discovery attempt --------------------------------
create function public.record_youtube_candidates(p_job uuid, p_token uuid, p_attempt uuid, p_source public.youtube_discovery_source, p_videos jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
  r jsonb;
  counts jsonb := '{"new":0,"refreshed":0,"auto_linked":0,"suggested":0,"unmatched":0}';
  k text;
begin
  perform 1 from pipeline_jobs where id = p_job and lease_token = p_token and lease_until > now() and status = 'running' and kind = 'youtube_discovery';
  if not found then raise exception 'lost job lease'; end if;
  if not exists (select 1 from collection_attempts where id = p_attempt and job_id = p_job and lease_token = p_token and http_status = 200) then
    raise exception 'missing source evidence';
  end if;
  if p_source = 'manual' then raise exception 'manual entries use record_manual_youtube_video'; end if;
  if jsonb_typeof(p_videos) <> 'array' or jsonb_array_length(p_videos) > 500 then raise exception 'invalid video batch'; end if;
  for v in select * from jsonb_array_elements(p_videos) loop
    r := upsert_youtube_candidate(v, p_source, p_attempt);
    k := r->>'outcome';
    counts := jsonb_set(counts, array[k], to_jsonb((counts->>k)::integer + 1));
    if k <> 'refreshed' then counts := jsonb_set(counts, '{new}', to_jsonb((counts->>'new')::integer + 1)); end if;
  end loop;
  return counts;
end $$;
revoke all on function public.record_youtube_candidates(uuid, uuid, uuid, public.youtube_discovery_source, jsonb) from public, anon, authenticated;
grant execute on function public.record_youtube_candidates(uuid, uuid, uuid, public.youtube_discovery_source, jsonb) to service_role;

-- Manual entry: an editor pasted a URL; the server fetched the video. ---------
create function public.record_manual_youtube_video(p_actor uuid, p_reason text, p_source_url text, p_http_status integer, p_raw_body text, p_checksum text, p_video jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_job uuid;
  v_token uuid := gen_random_uuid();
  v_attempt uuid;
  r jsonb;
begin
  if not exists (select 1 from profiles where id = p_actor and active and role in ('administrator', 'data_editor')) then raise exception 'forbidden'; end if;
  if coalesce(length(trim(p_reason)), 0) not between 10 and 2000 then raise exception 'a reason of at least 10 characters is required'; end if;
  if p_source_url ~* '[?&]key=' then raise exception 'source URL must not contain the API key'; end if;
  if p_http_status <> 200 then raise exception 'missing source evidence'; end if;
  insert into pipeline_jobs (kind, business_date, idempotency_key, status, attempts, lease_token, requested_by, reason, completed_at)
  values ('youtube_discovery', (now() at time zone 'Asia/Ulaanbaatar')::date,
          'youtube:manual:' || (p_video->>'videoId') || ':' || gen_random_uuid(), 'succeeded', 1, v_token, p_actor, trim(p_reason), now())
  returning id into v_job;
  insert into collection_attempts (job_id, attempt_number, lease_token, source_url, http_status, raw_body, checksum)
  values (v_job, 1, v_token, p_source_url, p_http_status, p_raw_body, p_checksum)
  returning id into v_attempt;
  r := upsert_youtube_candidate(p_video, 'manual', v_attempt);
  insert into audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, after_data, reason)
  values (p_actor, 'user', 'youtube_video.manual_added', 'youtube_video_asset', r->>'assetId',
          jsonb_build_object('videoId', p_video->>'videoId', 'jobId', v_job, 'outcome', r->>'outcome'), trim(p_reason));
  return r || jsonb_build_object('jobId', v_job);
end $$;
revoke all on function public.record_manual_youtube_video(uuid, text, text, integer, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_manual_youtube_video(uuid, text, text, integer, text, text, jsonb) to service_role;

-- Editor review ----------------------------------------------------------------
create function public.review_youtube_video(p_asset uuid, p_action text, p_reason text, p_recording uuid default null, p_kind public.youtube_asset_kind default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before youtube_video_assets;
  v_after youtube_video_assets;
  v_recording_before uuid;
  v_song uuid;
begin
  if staff_role() is null or staff_role() not in ('administrator', 'data_editor') then raise exception 'forbidden'; end if;
  if coalesce(length(trim(p_reason)), 0) not between 10 and 2000 then raise exception 'a reason of at least 10 characters is required'; end if;
  if p_action not in ('link', 'confirm', 'reject', 'unlink', 'kind', 'primary') then raise exception 'invalid action'; end if;
  select * into v_before from youtube_video_assets where platform_asset_id = p_asset for update;
  if not found then raise exception 'video not found'; end if;
  select recording_id into v_recording_before from platform_assets where id = p_asset for update;

  if p_action = 'link' then
    if p_recording is null then raise exception 'choose a recording'; end if;
    if not exists (select 1 from recordings r join songs s on s.id = r.song_id where r.id = p_recording and s.redirect_to is null) then
      raise exception 'choose a recording of an active song';
    end if;
    if v_recording_before is distinct from p_recording then
      update youtube_video_assets set is_primary = false where platform_asset_id = p_asset;
    end if;
    update platform_assets set recording_id = p_recording where id = p_asset;
    update youtube_video_assets
      set link_status = 'linked', verification = 'verified', link_method = 'editor', linked_by = auth.uid(), linked_at = now(),
          asset_kind = coalesce(p_kind, asset_kind, suggested_kind, 'other'), updated_at = now()
      where platform_asset_id = p_asset;
    insert into youtube_watchlist (platform_asset_id, reason, discovery_source, added_by, updated_by)
    values (p_asset, trim(p_reason), v_before.discovery_source, auth.uid(), auth.uid())
    on conflict (platform_asset_id) do update set active = true, updated_by = auth.uid(), updated_at = now();
    update entity_match_reviews set status = 'linked', reviewed_by = auth.uid(), reviewed_at = now()
      where platform_asset_id = p_asset and status = 'open';
  elsif p_action = 'confirm' then
    if v_before.link_status <> 'linked' or v_before.verification = 'verified' then raise exception 'nothing to confirm'; end if;
    update youtube_video_assets
      set verification = 'verified', linked_by = auth.uid(), asset_kind = coalesce(p_kind, asset_kind, suggested_kind, 'other'), updated_at = now()
      where platform_asset_id = p_asset;
    update youtube_watchlist set active = true, updated_by = auth.uid(), updated_at = now() where platform_asset_id = p_asset;
    update entity_match_reviews set status = 'linked', reviewed_by = auth.uid(), reviewed_at = now()
      where platform_asset_id = p_asset and status = 'open';
  elsif p_action in ('reject', 'unlink') then
    update platform_assets set recording_id = null where id = p_asset;
    update youtube_video_assets
      set link_status = case when p_action = 'reject' then 'rejected' else 'candidate' end::youtube_link_status,
          verification = 'unverified', link_method = null, linked_by = null, linked_at = null, is_primary = false, updated_at = now()
      where platform_asset_id = p_asset;
    update youtube_watchlist set active = false, updated_by = auth.uid(), updated_at = now() where platform_asset_id = p_asset;
    update entity_match_reviews set status = 'dismissed', reviewed_by = auth.uid(), reviewed_at = now()
      where platform_asset_id = p_asset and status = 'open';
    if p_action = 'unlink' then
      insert into entity_match_reviews (platform_asset_id, confidence, evidence)
      values (p_asset, null, jsonb_build_object('rule', 'youtube-catalog-v1', 'reopenedBy', auth.uid()));
    end if;
  elsif p_action = 'kind' then
    if p_kind is null then raise exception 'choose a kind'; end if;
    update youtube_video_assets set asset_kind = p_kind, updated_at = now() where platform_asset_id = p_asset;
  elsif p_action = 'primary' then
    if v_before.link_status <> 'linked' or v_before.verification <> 'verified' then raise exception 'only a confirmed link can be primary'; end if;
    select r.song_id into v_song from recordings r where r.id = v_recording_before;
    update youtube_video_assets y set is_primary = false, updated_at = now()
      from platform_assets pa join recordings r on r.id = pa.recording_id
      where pa.id = y.platform_asset_id and r.song_id = v_song and y.is_primary and y.platform_asset_id <> p_asset;
    update youtube_video_assets set is_primary = true, updated_at = now() where platform_asset_id = p_asset;
  end if;

  select * into v_after from youtube_video_assets where platform_asset_id = p_asset;
  insert into audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, before_data, after_data, reason)
  values (auth.uid(), 'user', 'youtube_video.' || p_action, 'youtube_video_asset', p_asset::text,
          (to_jsonb(v_before) - array['published_at', 'duration_seconds', 'metadata_refreshed_at', 'metadata_purged_at']) || jsonb_build_object('recordingId', v_recording_before),
          (to_jsonb(v_after) - array['published_at', 'duration_seconds', 'metadata_refreshed_at', 'metadata_purged_at']) || jsonb_build_object('recordingId', (select recording_id from platform_assets where id = p_asset)),
          trim(p_reason));
end $$;
revoke all on function public.review_youtube_video(uuid, text, text, uuid, public.youtube_asset_kind) from public, anon;
grant execute on function public.review_youtube_video(uuid, text, text, uuid, public.youtube_asset_kind) to authenticated;

create function public.set_youtube_watch(p_asset uuid, p_active boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if staff_role() is null or staff_role() not in ('administrator', 'data_editor') then raise exception 'forbidden'; end if;
  if coalesce(length(trim(p_reason)), 0) not between 10 and 2000 then raise exception 'a reason of at least 10 characters is required'; end if;
  if not exists (select 1 from youtube_video_assets where platform_asset_id = p_asset and link_status = 'linked') then
    raise exception 'only linked videos are collected daily';
  end if;
  select to_jsonb(w) into v_before from youtube_watchlist w where platform_asset_id = p_asset;
  insert into youtube_watchlist (platform_asset_id, active, reason, discovery_source, added_by, updated_by)
  select p_asset, p_active, trim(p_reason), discovery_source, auth.uid(), auth.uid() from youtube_video_assets where platform_asset_id = p_asset
  on conflict (platform_asset_id) do update set active = p_active, reason = trim(p_reason), updated_by = auth.uid(), updated_at = now();
  insert into audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, before_data, after_data, reason)
  select auth.uid(), 'user', 'youtube_watchlist.' || case when p_active then 'activated' else 'deactivated' end, 'youtube_watchlist', p_asset::text,
         v_before, to_jsonb(w), trim(p_reason) from youtube_watchlist w where platform_asset_id = p_asset;
end $$;
revoke all on function public.set_youtube_watch(uuid, boolean, text) from public, anon;
grant execute on function public.set_youtube_watch(uuid, boolean, text) to authenticated;

-- Chart-song searches ----------------------------------------------------------
-- Songs on the latest approved Apple chart with no linked YouTube video get a
-- search task, at most once per searchRepeatDays and searchDailyCap per day.
create function public.queue_youtube_chart_searches(p_job uuid, p_token uuid)
returns setof public.youtube_search_tasks
language plpgsql security definer set search_path = public as $$
declare
  v_job pipeline_jobs;
  v_config jsonb := (select parameters from methodology_configuration where code = 'youtube-catalog-v1');
  v_cap integer;
  v_used integer;
begin
  select * into v_job from pipeline_jobs where id = p_job and lease_token = p_token and lease_until > now() and status = 'running' and kind = 'youtube_discovery';
  if not found then raise exception 'lost job lease'; end if;
  select count(*) into v_used from youtube_search_tasks where business_date = v_job.business_date and status <> 'queued';
  v_cap := greatest((v_config->>'searchDailyCap')::integer - v_used, 0);
  insert into youtube_search_tasks (song_id, business_date, query, channel_id, job_id)
  select f.song_id, v_job.business_date, left(f.title || ' ' || coalesce(a.canonical_name, f.artist), 300),
         (select app.platform_artist_id from artist_platform_profiles app
           where app.artist_id = f.artist_id and app.platform_id = '00000000-0000-0000-0000-000000000002'
             and app.match_status = 'verified' and app.is_primary limit 1),
         p_job
  from chart_facts f
  left join artists a on a.id = f.artist_id
  where f.snapshot_date = (select max(snapshot_date) from chart_facts where snapshot_date <= v_job.business_date)
    and not exists (select 1 from platform_assets pa join recordings r on r.id = pa.recording_id
                    join youtube_video_assets y on y.platform_asset_id = pa.id
                    where r.song_id = f.song_id and y.link_status = 'linked')
    and not exists (select 1 from youtube_search_tasks t where t.song_id = f.song_id
                    and t.business_date > v_job.business_date - (v_config->>'searchRepeatDays')::integer)
  order by f.rank
  limit v_cap
  on conflict (song_id, business_date) do nothing;
  return query select * from youtube_search_tasks
    where business_date = v_job.business_date and status = 'queued' order by created_at, id limit v_cap;
end $$;
revoke all on function public.queue_youtube_chart_searches(uuid, uuid) from public, anon, authenticated;
grant execute on function public.queue_youtube_chart_searches(uuid, uuid) to service_role;

create function public.finish_youtube_search_task(p_job uuid, p_token uuid, p_task uuid, p_status text, p_units integer, p_results integer)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from pipeline_jobs where id = p_job and lease_token = p_token and lease_until > now() and status = 'running' and kind = 'youtube_discovery';
  if not found then raise exception 'lost job lease'; end if;
  if p_status not in ('searched', 'failed', 'skipped') then raise exception 'invalid task status'; end if;
  update youtube_search_tasks set status = p_status, quota_units = greatest(p_units, 0), results = p_results, completed_at = now(), job_id = p_job
    where id = p_task and status = 'queued';
  if not found then raise exception 'search task is not queued'; end if;
end $$;
revoke all on function public.finish_youtube_search_task(uuid, uuid, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.finish_youtube_search_task(uuid, uuid, uuid, text, integer, integer) to service_role;

-- Job lifecycle ----------------------------------------------------------------
create function public.enqueue_youtube_discovery(p_date date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_date date := coalesce(p_date, (now() at time zone 'Asia/Ulaanbaatar')::date);
  v_job uuid;
begin
  if v_date <> (now() at time zone 'Asia/Ulaanbaatar')::date then raise exception 'discovery runs for the current business date only'; end if;
  insert into pipeline_jobs (kind, business_date, idempotency_key)
  values ('youtube_discovery', v_date, 'youtube:discovery:' || v_date)
  on conflict (idempotency_key) do update set idempotency_key = excluded.idempotency_key
  returning id into v_job;
  return v_job;
end $$;
revoke all on function public.enqueue_youtube_discovery(date) from public, anon, authenticated;
grant execute on function public.enqueue_youtube_discovery(date) to service_role;

create function public.complete_youtube_discovery(p_job uuid, p_token uuid, p_summary jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  update pipeline_jobs set status = 'succeeded', completed_at = now(), lease_until = null
    where id = p_job and lease_token = p_token and lease_until > now() and status = 'running' and kind = 'youtube_discovery';
  if not found then raise exception 'lost job lease'; end if;
  insert into audit_logs (action, entity_type, entity_id, after_data, reason)
  values ('youtube_discovery.completed', 'pipeline_job', p_job::text, p_summary, 'Daily YouTube candidate discovery');
end $$;
revoke all on function public.complete_youtube_discovery(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.complete_youtube_discovery(uuid, uuid, jsonb) to service_role;

-- Retention: clear video metadata that has not been refreshed for 30 days ----
create or replace function public.apply_youtube_retention(p_now timestamptz, p_job uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_config jsonb;
  v_run uuid := gen_random_uuid();
  v_today date := (p_now at time zone 'Asia/Ulaanbaatar')::date;
  v_metadata_cutoff timestamptz;
  v_statistics_cutoff date;
  v_counts jsonb := '{}'::jsonb;
  v_n integer;
  v_from timestamptz;
  v_through timestamptz;
  v_dfrom date;
  v_dthrough date;
  v_tombstone jsonb;
begin
  v_config := youtube_retention_config();
  if v_config is null or v_config->>'mode' not in ('30_day', '36_month') then
    raise exception 'youtube retention is not configured';
  end if;
  v_metadata_cutoff := p_now - make_interval(days => (v_config->>'metadataDays')::integer);
  v_statistics_cutoff := case
    when v_config->>'mode' = '36_month' then (v_today - make_interval(months => (v_config->>'statisticsMonths')::integer))::date
    else v_today - (v_config->>'statisticsDays')::integer
  end;
  v_tombstone := jsonb_build_object(
    'tombstone', true,
    'reason', 'deleted under YouTube retention policy',
    'retentionRunId', v_run,
    'purgedAt', p_now,
    'methodologyVersion', v_config->>'methodologyVersion'
  );
  perform set_config('atlas.retention', 'purge', true);

  -- 1. Raw artist payloads (channel responses): tombstone after 30 days.
  select count(*), min(received_at), max(received_at) into v_n, v_from, v_through
  from artist_source_payloads where retention_class <> 'permanent' and purged_at is null and received_at < v_metadata_cutoff;
  if v_n > 0 then
    update artist_source_payloads
      set payload = v_tombstone || jsonb_build_object('retentionClass', retention_class), purged_at = p_now, purge_run_id = v_run
      where retention_class <> 'permanent' and purged_at is null and received_at < v_metadata_cutoff;
    insert into audit_logs (action, entity_type, entity_id, after_data, reason, correlation_id)
    values ('youtube_retention_purge', 'artist_source_payloads', v_run::text,
      jsonb_build_object('count', v_n, 'retentionClass', 'youtube_metadata', 'operation', 'tombstone', 'from', v_from, 'through', v_through),
      'YouTube API data retention limit', v_run);
  end if;
  v_counts := v_counts || jsonb_build_object('artistSourcePayloads', v_n);

  -- 2. Raw chart payloads (future YouTube collectors).
  select count(*), min(received_at), max(received_at) into v_n, v_from, v_through
  from raw_payloads where retention_class <> 'permanent' and purged_at is null and received_at < v_metadata_cutoff;
  if v_n > 0 then
    update raw_payloads
      set payload = v_tombstone || jsonb_build_object('retentionClass', retention_class), purged_at = p_now, purge_run_id = v_run
      where retention_class <> 'permanent' and purged_at is null and received_at < v_metadata_cutoff;
    insert into audit_logs (action, entity_type, entity_id, after_data, reason, correlation_id)
    values ('youtube_retention_purge', 'raw_payloads', v_run::text,
      jsonb_build_object('count', v_n, 'retentionClass', 'youtube_metadata', 'operation', 'tombstone', 'from', v_from, 'through', v_through),
      'YouTube API data retention limit', v_run);
  end if;
  v_counts := v_counts || jsonb_build_object('rawPayloads', v_n);

  -- 3. Raw HTTP bodies kept by pipeline attempts.
  select count(*), min(received_at), max(received_at) into v_n, v_from, v_through
  from collection_attempts where retention_class <> 'permanent' and purged_at is null and received_at < v_metadata_cutoff;
  if v_n > 0 then
    update collection_attempts set raw_body = null, purged_at = p_now, purge_run_id = v_run
      where retention_class <> 'permanent' and purged_at is null and received_at < v_metadata_cutoff;
    insert into audit_logs (action, entity_type, entity_id, after_data, reason, correlation_id)
    values ('youtube_retention_purge', 'collection_attempts', v_run::text,
      jsonb_build_object('count', v_n, 'retentionClass', 'youtube_metadata', 'operation', 'tombstone', 'from', v_from, 'through', v_through),
      'YouTube API data retention limit', v_run);
  end if;
  v_counts := v_counts || jsonb_build_object('collectionAttempts', v_n);

  -- 4. YouTube statistics: delete at the end of the active window.
  select count(*), min(metric_date), max(metric_date) into v_n, v_dfrom, v_dthrough
  from artist_metric_snapshots where retention_class = 'youtube_statistics' and metric_date < v_statistics_cutoff;
  if v_n > 0 then
    delete from artist_metric_snapshots where retention_class = 'youtube_statistics' and metric_date < v_statistics_cutoff;
    insert into audit_logs (action, entity_type, entity_id, after_data, reason, correlation_id)
    values ('youtube_retention_purge', 'artist_metric_snapshots', v_run::text,
      jsonb_build_object('count', v_n, 'retentionClass', 'youtube_statistics', 'operation', 'delete', 'from', v_dfrom, 'through', v_dthrough),
      'YouTube API data retention limit', v_run);
  end if;
  v_counts := v_counts || jsonb_build_object('artistMetricSnapshots', v_n);

  -- 5. Channel names, descriptions and thumbnails cached on verified profiles.
  --    The channel ID and the verification decision are Atlas data and stay.
  select count(*), min(last_enriched_at), max(last_enriched_at) into v_n, v_from, v_through
  from artist_platform_profiles
  where platform_id = '00000000-0000-0000-0000-000000000002'
    and coalesce(last_enriched_at, created_at) < v_metadata_cutoff
    and metadata ?| array['sourceName', 'description', 'customUrl', 'imageUrl', 'publishedAt'];
  if v_n > 0 then
    update artist_platform_profiles
      set metadata = (metadata - array['sourceName', 'description', 'customUrl', 'imageUrl', 'publishedAt'])
                     || jsonb_build_object('metadataPurgedAt', p_now, 'metadataPurgeRunId', v_run),
          updated_at = p_now
      where platform_id = '00000000-0000-0000-0000-000000000002'
        and coalesce(last_enriched_at, created_at) < v_metadata_cutoff
        and metadata ?| array['sourceName', 'description', 'customUrl', 'imageUrl', 'publishedAt'];
    insert into audit_logs (action, entity_type, entity_id, after_data, reason, correlation_id)
    values ('youtube_retention_purge', 'artist_platform_profiles', v_run::text,
      jsonb_build_object('count', v_n, 'retentionClass', 'youtube_metadata', 'operation', 'strip_metadata', 'from', v_from, 'through', v_through),
      'YouTube API data retention limit', v_run);
  end if;
  v_counts := v_counts || jsonb_build_object('artistPlatformProfiles', v_n);

  -- 6. Video titles, channel names, thumbnails, publish dates and durations
  --    (A2). IDs, kinds, links and review decisions are Atlas data and stay.
  select count(*), min(metadata_refreshed_at), max(metadata_refreshed_at) into v_n, v_from, v_through
  from youtube_video_assets where metadata_refreshed_at < v_metadata_cutoff;
  if v_n > 0 then
    update platform_assets pa
      set platform_title = y.video_id, platform_artist_name = y.channel_id, artwork_url = null,
          platform_album = null, duration_ms = null, raw_metadata = '{}'::jsonb
      from youtube_video_assets y
      where y.platform_asset_id = pa.id and y.metadata_refreshed_at < v_metadata_cutoff;
    update youtube_video_assets
      set published_at = null, duration_seconds = null, metadata_refreshed_at = null, metadata_purged_at = p_now, updated_at = p_now
      where metadata_refreshed_at < v_metadata_cutoff;
    insert into audit_logs (action, entity_type, entity_id, after_data, reason, correlation_id)
    values ('youtube_retention_purge', 'youtube_video_assets', v_run::text,
      jsonb_build_object('count', v_n, 'retentionClass', 'youtube_metadata', 'operation', 'strip_metadata', 'from', v_from, 'through', v_through),
      'YouTube API data retention limit', v_run);
  end if;
  v_counts := v_counts || jsonb_build_object('youtubeVideoMetadata', v_n);

  perform set_config('atlas.retention', '', true);

  insert into retention_runs (id, job_id, business_date, mode, methodology_version, metadata_cutoff, statistics_cutoff, counts, started_at, completed_at)
  values (v_run, p_job, v_today, v_config->>'mode', v_config->>'methodologyVersion', v_metadata_cutoff, v_statistics_cutoff, v_counts, p_now, now());
  -- One audit row per run, even when nothing expired, so a silent job is visible.
  insert into audit_logs (action, entity_type, entity_id, after_data, reason, correlation_id)
  values ('youtube_retention_run', 'retention_run', v_run::text,
    jsonb_build_object('mode', v_config->>'mode', 'methodologyVersion', v_config->>'methodologyVersion',
      'metadataCutoff', v_metadata_cutoff, 'statisticsCutoff', v_statistics_cutoff, 'counts', v_counts),
    'Scheduled YouTube retention run', v_run);
  return jsonb_build_object('runId', v_run, 'mode', v_config->>'mode', 'metadataCutoff', v_metadata_cutoff,
    'statisticsCutoff', v_statistics_cutoff, 'counts', v_counts);
end $$;

comment on table public.youtube_video_assets is
  'YouTube videos as platform assets. Linked through platform_assets.recording_id. Titles and other YouTube metadata live on platform_assets and are cleared by the retention job after 30 days without a refresh.';
comment on table public.youtube_watchlist is
  'Videos collected daily (A3). Linking adds a video; editors can pause it with a reason.';
