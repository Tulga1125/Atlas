create function public.review_artist_identity(
  p_artist_id uuid,
  p_canonical_name text,
  p_artist_type text,
  p_country_code text,
  p_locality public.locality,
  p_verification public.verification_status,
  p_evidence_type text default null,
  p_evidence_url text default null,
  p_evidence_notes text default null,
  p_youtube_channel_id text default null,
  p_youtube_profile_url text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_role public.user_role;
  v_actor_active boolean;
  v_before public.artists%rowtype;
  v_after public.artists%rowtype;
  v_youtube_platform_id uuid;
  v_existing_profile public.artist_platform_profiles%rowtype;
  v_evidence_type text := nullif(trim(p_evidence_type), '');
  v_evidence_url text := nullif(trim(p_evidence_url), '');
  v_evidence_notes text := nullif(trim(p_evidence_notes), '');
  v_youtube_channel_id text := nullif(trim(p_youtube_channel_id), '');
  v_youtube_profile_url text := nullif(trim(p_youtube_profile_url), '');
  v_country_code text := nullif(upper(trim(p_country_code)), '');
begin
  if v_actor_id is null then
    raise exception 'artist review requires authentication';
  end if;

  select role, active
  into v_actor_role, v_actor_active
  from public.profiles
  where id = v_actor_id;

  if not coalesce(v_actor_active, false)
    or v_actor_role not in ('administrator', 'data_editor') then
    raise exception 'artist review requires administrator or data_editor role';
  end if;

  select *
  into v_before
  from public.artists
  where id = p_artist_id
  for update;

  if not found then
    raise exception 'artist not found';
  end if;

  if nullif(trim(p_canonical_name), '') is null then
    raise exception 'canonical artist name is required';
  end if;

  if char_length(trim(p_canonical_name)) > 160 then
    raise exception 'canonical artist name is too long';
  end if;

  if p_artist_type not in ('person', 'group', 'band', 'project') then
    raise exception 'invalid artist type';
  end if;

  if v_country_code is not null and v_country_code !~ '^[A-Z]{2}$' then
    raise exception 'country code must contain two ASCII letters';
  end if;

  if p_locality = 'local' and p_verification = 'verified' then
    if v_country_code is distinct from 'MN' then
      raise exception 'verified local artists require country code MN';
    end if;

    if v_evidence_type is null
      and not exists (
        select 1
        from public.artist_verification_evidence ave
        where ave.artist_id = p_artist_id
          and ave.verified_at is not null
      ) then
      raise exception 'verified local artists require verification evidence';
    end if;
  end if;

  if v_evidence_type is not null
    and v_evidence_type not in (
      'official_profile',
      'musicbrainz',
      'wikidata',
      'label',
      'press',
      'artist_claim',
      'manual'
    ) then
    raise exception 'invalid artist evidence type';
  end if;

  if v_evidence_type is not null
    and v_evidence_url is null
    and v_evidence_notes is null then
    raise exception 'artist evidence requires a URL or review notes';
  end if;

  if v_evidence_url is not null
    and (
      char_length(v_evidence_url) > 2048
      or v_evidence_url !~* '^https?://[^[:space:]]+$'
    ) then
    raise exception 'artist evidence URL must use HTTP or HTTPS';
  end if;

  if v_evidence_notes is not null and char_length(v_evidence_notes) > 1000 then
    raise exception 'artist evidence notes are too long';
  end if;

  if v_youtube_profile_url is not null
    and (
      char_length(v_youtube_profile_url) > 2048
      or v_youtube_profile_url !~* '^https?://[^[:space:]]+$'
    ) then
    raise exception 'YouTube profile URL must use HTTP or HTTPS';
  end if;

  update public.artists
  set canonical_name = trim(p_canonical_name),
      sort_name = public.normalize_catalog_text(trim(p_canonical_name)),
      artist_type = p_artist_type,
      country_code = v_country_code,
      locality = p_locality,
      verification = p_verification,
      updated_at = now()
  where id = p_artist_id
  returning * into v_after;

  if v_evidence_type is not null then
    insert into public.artist_verification_evidence (
      artist_id,
      evidence_type,
      source_url,
      payload,
      supports_locality,
      supports_country_code,
      notes,
      reviewed_by,
      verified_at
    ) values (
      p_artist_id,
      v_evidence_type,
      v_evidence_url,
      jsonb_build_object('review_source', 'dashboard'),
      p_locality,
      v_country_code,
      v_evidence_notes,
      v_actor_id,
      case when p_verification = 'verified' then now() else null end
    );
  end if;

  if v_youtube_channel_id is not null then
    if v_youtube_channel_id !~ '^UC[A-Za-z0-9_-]{22}$' then
      raise exception 'YouTube channel ID must start with UC and contain 24 characters';
    end if;

    select id into v_youtube_platform_id
    from public.platforms
    where code = 'youtube';

    if v_youtube_platform_id is null then
      raise exception 'YouTube platform is not configured';
    end if;

    select *
    into v_existing_profile
    from public.artist_platform_profiles
    where platform_id = v_youtube_platform_id
      and platform_artist_id = v_youtube_channel_id;

    if found and v_existing_profile.artist_id <> p_artist_id then
      raise exception 'YouTube channel is already linked to another artist';
    end if;

    select *
    into v_existing_profile
    from public.artist_platform_profiles
    where artist_id = p_artist_id
      and platform_id = v_youtube_platform_id
      and is_primary
    for update;

    if found then
      update public.artist_platform_profiles
      set platform_artist_id = v_youtube_channel_id,
          profile_url = coalesce(
            v_youtube_profile_url,
            'https://www.youtube.com/channel/' || v_youtube_channel_id
          ),
          match_status = 'verified',
          match_method = 'manual',
          confidence = 1,
          updated_at = now()
      where id = v_existing_profile.id;
    else
      insert into public.artist_platform_profiles (
        artist_id,
        platform_id,
        platform_artist_id,
        profile_url,
        is_primary,
        match_status,
        match_method,
        confidence
      ) values (
        p_artist_id,
        v_youtube_platform_id,
        v_youtube_channel_id,
        coalesce(
          v_youtube_profile_url,
          'https://www.youtube.com/channel/' || v_youtube_channel_id
        ),
        true,
        'verified',
        'manual',
        1
      );
    end if;
  end if;

  insert into public.audit_logs (
    actor_user_id,
    actor_type,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    reason
  ) values (
    v_actor_id,
    'staff',
    'artist_identity_reviewed',
    'artist',
    p_artist_id::text,
    to_jsonb(v_before),
    to_jsonb(v_after),
    coalesce(v_evidence_notes, 'Artist identity review')
  );

  return p_artist_id;
end;
$$;

revoke all on function public.review_artist_identity(
  uuid,
  text,
  text,
  text,
  public.locality,
  public.verification_status,
  text,
  text,
  text,
  text,
  text
) from public, anon;

grant execute on function public.review_artist_identity(
  uuid,
  text,
  text,
  text,
  public.locality,
  public.verification_status,
  text,
  text,
  text,
  text,
  text
) to authenticated;

comment on function public.review_artist_identity(
  uuid,
  text,
  text,
  text,
  public.locality,
  public.verification_status,
  text,
  text,
  text,
  text,
  text
) is
  'Atomically reviews an artist identity, retains evidence, links an exact YouTube channel, and writes an immutable audit record. Authorization is re-checked inside the function.';
