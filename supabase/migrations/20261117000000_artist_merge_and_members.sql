-- Artist merges and group membership (owner, 2026-11-17: Gangbay is the band
-- of Gangaa and Baynaa, who also release solo).
--
-- * Apple's chart feed has no artist IDs, so ingestion keys each credited
--   artist by the song asset and never merges by name. A merge happens only
--   on an explicit decision: an administrator, or the owner's recorded
--   instruction applied by the service role. The duplicate is redirected,
--   never deleted, like songs (catalog_operations).
-- * Credits, primary-artist links, aliases, platform profiles, evidence and
--   context tags move to the target. Historical derived rows (signals,
--   metric snapshots, YouTube artist days) stay where they were computed.
-- * artist_memberships records "member of" between a person and a group.

alter table public.artists add column redirect_to uuid references public.artists(id);
alter table public.artists add constraint artists_no_self_redirect check (redirect_to is distinct from id);
create index artists_redirect_idx on public.artists (redirect_to) where redirect_to is not null;

create table public.artist_memberships (
  id uuid primary key default gen_random_uuid(),
  group_artist_id uuid not null references public.artists(id),
  member_artist_id uuid not null references public.artists(id),
  role text not null default 'member' check (length(trim(role)) between 1 and 80),
  reason text not null check (length(trim(reason)) between 10 and 2000),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (group_artist_id <> member_artist_id),
  unique (group_artist_id, member_artist_id)
);
alter table public.artist_memberships enable row level security;
create policy "public reads memberships of verified artists" on public.artist_memberships for select to anon, authenticated
  using (exists (select 1 from public.artists a where a.id = group_artist_id and a.verification = 'verified')
     and exists (select 1 from public.artists a where a.id = member_artist_id and a.verification = 'verified'));
grant select on public.artist_memberships to anon, authenticated;

-- Internal: performs a merge. Not executable by any API role.
create function public.apply_artist_merge(p_source uuid, p_target uuid, p_reason text, p_actor uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_source artists;
  v_target artists;
  v_moved jsonb := '{}';
  n integer;
begin
  if coalesce(length(trim(p_reason)), 0) not between 10 and 2000 then raise exception 'a reason of at least 10 characters is required'; end if;
  if p_source = p_target then raise exception 'choose two different artists'; end if;
  select * into v_source from artists where id = p_source for update;
  select * into v_target from artists where id = p_target for update;
  if v_source.id is null or v_target.id is null then raise exception 'artist not found'; end if;
  if v_source.redirect_to is not null then raise exception 'the source artist is already merged'; end if;
  if v_target.redirect_to is not null then raise exception 'the target artist is itself merged; use its target'; end if;

  -- Credits: drop a duplicate credit, move the rest.
  delete from song_artists sa using song_artists t
    where sa.artist_id = p_source and t.artist_id = p_target and t.song_id = sa.song_id and t.credit_role = sa.credit_role;
  update song_artists set artist_id = p_target where artist_id = p_source;
  get diagnostics n = row_count; v_moved := v_moved || jsonb_build_object('credits', n);
  update songs set primary_artist_id = p_target, updated_at = now() where primary_artist_id = p_source;
  get diagnostics n = row_count; v_moved := v_moved || jsonb_build_object('primarySongs', n);

  insert into artist_aliases (artist_id, alias, normalized_alias, language, platform_id)
  select p_target, alias, normalized_alias, language, platform_id from artist_aliases where artist_id = p_source
  on conflict do nothing;
  insert into artist_aliases (artist_id, alias, normalized_alias)
  values (p_target, v_source.canonical_name, normalize_catalog_text(v_source.canonical_name)) on conflict do nothing;

  update artist_platform_profiles p set artist_id = p_target,
    is_primary = p.is_primary and not exists (select 1 from artist_platform_profiles t where t.artist_id = p_target and t.platform_id = p.platform_id and t.is_primary),
    updated_at = now()
  where p.artist_id = p_source;
  get diagnostics n = row_count; v_moved := v_moved || jsonb_build_object('profiles', n);
  update artist_verification_evidence set artist_id = p_target where artist_id = p_source;
  update artist_context_tags set artist_id = p_target where artist_id = p_source
    and not exists (select 1 from artist_context_tags t where t.artist_id = p_target and t.term_id = artist_context_tags.term_id);
  update artist_memberships set group_artist_id = p_target where group_artist_id = p_source
    and not exists (select 1 from artist_memberships m where m.group_artist_id = p_target and m.member_artist_id = artist_memberships.member_artist_id);
  update artist_memberships set member_artist_id = p_target where member_artist_id = p_source
    and not exists (select 1 from artist_memberships m where m.member_artist_id = p_target and m.group_artist_id = artist_memberships.group_artist_id);

  update artists set redirect_to = p_target, updated_at = now() where id = p_source;
  insert into audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, before_data, after_data, reason)
  values (p_actor, case when p_actor is null then 'system' else 'user' end, 'artist.merged', 'artist', p_source::text,
          to_jsonb(v_source), jsonb_build_object('redirectTo', p_target, 'moved', v_moved), trim(p_reason));
  return jsonb_build_object('source', p_source, 'target', p_target, 'moved', v_moved);
end $$;
revoke all on function public.apply_artist_merge(uuid, uuid, text, uuid) from public, anon, authenticated, service_role;

create function public.merge_artist(p_source uuid, p_target uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if staff_role() is distinct from 'administrator' then raise exception 'forbidden'; end if;
  return apply_artist_merge(p_source, p_target, p_reason, auth.uid());
end $$;
revoke all on function public.merge_artist(uuid, uuid, text) from public, anon;
grant execute on function public.merge_artist(uuid, uuid, text) to authenticated;

-- The owner's instruction applied by the service role (recorded as system).
create function public.merge_artist_on_owner_instruction(p_source uuid, p_target uuid, p_reason text) returns jsonb
language sql security definer set search_path = public as $$
  select apply_artist_merge(p_source, p_target, p_reason, null)
$$;
revoke all on function public.merge_artist_on_owner_instruction(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.merge_artist_on_owner_instruction(uuid, uuid, text) to service_role;

create function public.apply_artist_membership(p_group uuid, p_member uuid, p_role text, p_reason text, p_actor uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if exists (select 1 from artists where id in (p_group, p_member) and redirect_to is not null) then raise exception 'use the merged target artist'; end if;
  insert into artist_memberships (group_artist_id, member_artist_id, role, reason, created_by)
  values (p_group, p_member, coalesce(nullif(trim(p_role), ''), 'member'), trim(p_reason), p_actor)
  on conflict (group_artist_id, member_artist_id) do update set role = excluded.role
  returning id into v_id;
  insert into audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, after_data, reason)
  values (p_actor, case when p_actor is null then 'system' else 'user' end, 'artist.membership_set', 'artist', p_group::text,
          jsonb_build_object('member', p_member, 'role', p_role), trim(p_reason));
  return v_id;
end $$;
revoke all on function public.apply_artist_membership(uuid, uuid, text, text, uuid) from public, anon, authenticated, service_role;
create function public.set_artist_membership(p_group uuid, p_member uuid, p_role text, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if staff_role() is null or staff_role() not in ('administrator', 'data_editor') then raise exception 'forbidden'; end if;
  return apply_artist_membership(p_group, p_member, p_role, p_reason, auth.uid());
end $$;
revoke all on function public.set_artist_membership(uuid, uuid, text, text) from public, anon;
grant execute on function public.set_artist_membership(uuid, uuid, text, text) to authenticated;
create function public.set_artist_membership_on_owner_instruction(p_group uuid, p_member uuid, p_role text, p_reason text) returns uuid
language sql security definer set search_path = public as $$
  select apply_artist_membership(p_group, p_member, p_role, p_reason, null)
$$;
revoke all on function public.set_artist_membership_on_owner_instruction(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_artist_membership_on_owner_instruction(uuid, uuid, text, text) to service_role;

-- Owner-stated identity facts (verification, locality, type, a new artist).
create function public.record_owner_artist(p_artist uuid, p_name text, p_artist_type text, p_reason text, p_aliases text[] default '{}') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_artist; v_before artists; a text;
begin
  if coalesce(length(trim(p_reason)), 0) not between 10 and 2000 then raise exception 'a reason of at least 10 characters is required'; end if;
  if p_artist_type not in ('person', 'group', 'band', 'project') then raise exception 'invalid artist type'; end if;
  if v_id is null then
    insert into artists (canonical_name, sort_name, source_key, country_code, locality, artist_type, verification)
    values (trim(p_name), normalize_catalog_text(p_name), 'owner:' || gen_random_uuid(), 'MN', 'local', p_artist_type, 'verified')
    returning id into v_id;
  else
    select * into v_before from artists where id = v_id for update;
    if v_before.id is null or v_before.redirect_to is not null then raise exception 'artist not found or merged'; end if;
    update artists set canonical_name = coalesce(nullif(trim(p_name), ''), canonical_name), country_code = 'MN', locality = 'local',
      artist_type = p_artist_type, verification = 'verified', updated_at = now() where id = v_id;
  end if;
  foreach a in array coalesce(p_aliases, '{}') loop
    insert into artist_aliases (artist_id, alias, normalized_alias) values (v_id, trim(a), normalize_catalog_text(a)) on conflict do nothing;
  end loop;
  insert into artist_verification_evidence (artist_id, evidence_type, payload, supports_locality, supports_country_code, notes, verified_at)
  values (v_id, 'manual', jsonb_build_object('approval', 'owner'), 'local', 'MN', trim(p_reason), now());
  insert into audit_logs (actor_type, action, entity_type, entity_id, before_data, after_data, reason)
  values ('system', case when p_artist is null then 'artist.created' else 'artist.verified' end, 'artist', v_id::text,
          to_jsonb(v_before), (select to_jsonb(x) from artists x where x.id = v_id), trim(p_reason));
  return v_id;
end $$;
revoke all on function public.record_owner_artist(uuid, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.record_owner_artist(uuid, text, text, text, text[]) to service_role;

-- Add a credit to an existing song on the owner's instruction.
create function public.add_song_credit_on_owner_instruction(p_song uuid, p_artist uuid, p_role text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_role not in ('primary', 'featured') then raise exception 'invalid credit'; end if;
  if coalesce(length(trim(p_reason)), 0) not between 10 and 2000 then raise exception 'a reason of at least 10 characters is required'; end if;
  insert into song_artists (song_id, artist_id, credit_role, credit_order)
  values (p_song, p_artist, p_role, (select coalesce(max(credit_order), 0) + 1 from song_artists where song_id = p_song))
  on conflict do nothing;
  insert into audit_logs (actor_type, action, entity_type, entity_id, after_data, reason)
  values ('system', 'song.credit_added', 'song', p_song::text, jsonb_build_object('artist', p_artist, 'role', p_role), trim(p_reason));
end $$;
revoke all on function public.add_song_credit_on_owner_instruction(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.add_song_credit_on_owner_instruction(uuid, uuid, text, text) to service_role;

-- Import: a song on a channel may be credited to a member artist (artistId).
create or replace function public.import_youtube_artist_catalog(p_reason text, p_source_url text, p_raw_body text, p_checksum text, p_artist jsonb)
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
  v_credit uuid;
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
    -- A member's solo song on the group's channel is credited to the member.
    v_credit := coalesce((s->>'artistId')::uuid, v_artist);
    if not exists (select 1 from artists where id = v_credit and redirect_to is null) then raise exception 'credited artist not found'; end if;
    if v_credit <> v_artist and not exists (select 1 from artist_memberships where group_artist_id = v_artist and member_artist_id = v_credit) then
      raise exception 'a song on this channel can be credited only to the channel artist or a member';
    end if;
    v := null;
    select x.value into v from jsonb_array_elements(s->'videos') x where x.value->>'role' = 'source' limit 1;
    if v is null then raise exception 'song without a source video'; end if;

    select id into v_song from songs where source_key = 'youtube:' || (v->>'videoId');
    if v_song is null then
      insert into songs (canonical_title, normalized_title, source_key, primary_artist_id, release_date, locality, verification)
      values (trim(s->>'title'), normalize_catalog_text(s->>'title'), 'youtube:' || (v->>'videoId'),
              case when s->>'credit' = 'primary' then v_credit end, (s->>'releaseDate')::date, 'local',
              case when v->>'suggestedKind' in ('official_music_video', 'official_audio', 'lyric_video') then 'verified' else 'suggested' end::verification_status)
      returning id into v_song;
      insert into song_artists (song_id, artist_id, credit_role, credit_order) values (v_song, v_credit, s->>'credit', 0);
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
