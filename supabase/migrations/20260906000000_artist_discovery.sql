-- Source discovery is separate from chart ingestion and staff identity review.
-- Only a server credential can run this explicit, audited bootstrap import.
create or replace function public.import_musicbrainz_artists(p_payload jsonb, p_curated jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_platform uuid := '00000000-0000-0000-0000-000000000004';
  v_checksum text;
  v_run uuid;
  v_artist uuid;
  v_item jsonb;
  v_curated jsonb;
  v_alias jsonb;
  v_new boolean;
  v_created integer := 0;
  v_verified integer := 0;
  v_existing integer := 0;
  v_result jsonb;
begin
  if p_payload is null or p_curated is null
    or p_payload->>'source' is distinct from 'musicbrainz'
    or p_payload->>'query' is distinct from 'country:MN'
    or jsonb_typeof(p_payload->'artists') is distinct from 'array'
    or jsonb_typeof(p_curated) is distinct from 'array' then
    raise exception 'invalid MusicBrainz import envelope';
  end if;
  if jsonb_array_length(p_payload->'artists') not between 1 and 10000
    or (p_payload->>'count')::integer is distinct from jsonb_array_length(p_payload->'artists')
    or jsonb_array_length(p_curated) > 100
    or (select count(distinct a->>'id') from jsonb_array_elements(p_payload->'artists') a) <> jsonb_array_length(p_payload->'artists')
    or (select count(distinct a->>'mbid') from jsonb_array_elements(p_curated) a) <> jsonb_array_length(p_curated) then
    raise exception 'incomplete or duplicate MusicBrainz import';
  end if;
  for v_curated in select * from jsonb_array_elements(p_curated) loop
    if not exists (select 1 from jsonb_array_elements(p_payload->'artists') a where a->>'id' = v_curated->>'mbid')
      or coalesce(char_length(trim(v_curated->>'name')), 0) not between 1 and 200
      or coalesce(char_length(trim(v_curated->>'biography')), 0) not between 1 and 1000
      or coalesce(char_length(trim(v_curated->>'notes')), 0) not between 1 and 1000
      or coalesce(char_length(v_curated->>'sourceName'), 0) not between 1 and 100
      or coalesce(v_curated->>'sourceUrl', '') !~* '^https?://[^[:space:]]+$'
      or char_length(v_curated->>'sourceUrl') > 2048
      or coalesce(v_curated->>'evidenceType', '') not in ('official_profile', 'label', 'press')
      or coalesce(v_curated->>'checkedAt', '') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'curated identities require a matching MBID and checked source evidence';
    end if;
    perform (v_curated->>'checkedAt')::date;
  end loop;
  perform (p_payload->>'fetchedAt')::timestamptz;
  if p_payload->>'fetchedAt' is null then raise exception 'missing discovery timestamp'; end if;
  perform pg_advisory_xact_lock(hashtextextended('atlas:musicbrainz-import', 0));
  v_checksum := encode(digest(jsonb_build_object('source', p_payload, 'curated', p_curated)::text, 'sha256'), 'hex');
  select id into v_run from public.artist_intelligence_runs where idempotency_key = 'musicbrainz:import:' || v_checksum;
  if v_run is not null then
    select after_data into v_result from public.audit_logs where action = 'artist_discovery_imported' and entity_id = v_run::text;
    return v_result || jsonb_build_object('replayed', true);
  end if;
  insert into public.artist_intelligence_runs(source_platform_id, idempotency_key, scheduled_for, started_at, status, artists_requested)
  values(v_platform, 'musicbrainz:import:' || v_checksum, now(), now(), 'running', jsonb_array_length(p_payload->'artists')) returning id into v_run;
  insert into public.artist_source_payloads(run_id, source_url, source_timestamp, checksum, payload)
  values(v_run, 'https://musicbrainz.org/ws/2/artist/?query=country:MN&fmt=json', (p_payload->>'fetchedAt')::timestamptz, v_checksum,
    jsonb_build_object('discovery', p_payload, 'curated', p_curated));

  for v_item in select * from jsonb_array_elements(p_payload->'artists') loop
    select c into v_curated from jsonb_array_elements(p_curated) c where c->>'mbid' = v_item->>'id';
    if coalesce(v_item->>'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (v_item->>'country' is distinct from 'MN' and v_curated is null)
      or coalesce(char_length(trim(v_item->>'name')), 0) not between 1 and 200 then
      raise exception 'invalid MusicBrainz artist';
    end if;
    select c into v_curated from jsonb_array_elements(p_curated) c where c->>'mbid' = v_item->>'id';
    select artist_id into v_artist from public.artist_platform_profiles where platform_id = v_platform and platform_artist_id = v_item->>'id';
    if v_artist is null then
      select id into v_artist from public.artists where source_key = 'musicbrainz:' || (v_item->>'id');
    end if;
    v_new := v_artist is null;
    if v_new then
      insert into public.artists(canonical_name, sort_name, source_key, country_code, locality, artist_type, verification, biography)
      values(coalesce(v_curated->>'name', v_item->>'name'), public.normalize_catalog_text(coalesce(v_curated->>'name', v_item->>'name')),
        'musicbrainz:' || (v_item->>'id'), 'MN',
        case when v_curated is null then 'unknown'::public.locality else 'local'::public.locality end,
        case v_item->>'type' when 'Person' then 'person' when 'Group' then 'group' else 'project' end,
        case when v_curated is null then 'suggested'::public.verification_status else 'verified'::public.verification_status end,
        v_curated->>'biography') returning id into v_artist;
      v_created := v_created + 1;
      if v_curated is not null then v_verified := v_verified + 1; end if;
    else
      -- Names are never an identity key. Existing identities and editorial decisions
      -- are deliberately preserved, even if a new curated manifest includes them.
      v_existing := v_existing + 1;
    end if;
    insert into public.artist_platform_profiles(artist_id, platform_id, platform_artist_id, profile_url, match_status, match_method, metadata)
    values(v_artist, v_platform, v_item->>'id', 'https://musicbrainz.org/artist/' || (v_item->>'id'), 'verified', 'source',
      jsonb_build_object('discoveryRunId', v_run, 'identitySourceUrl', case when v_new then v_curated->>'sourceUrl' end,
        'identitySourceName', case when v_new then v_curated->>'sourceName' end))
    on conflict (platform_id, platform_artist_id) do nothing;
    for v_alias in select * from jsonb_array_elements(coalesce(v_item->'aliases', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('name', v_item->>'name'))) loop
      if coalesce(char_length(trim(v_alias->>'name')), 0) not between 1 and 200 then raise exception 'invalid artist alias'; end if;
      insert into public.artist_aliases(artist_id, alias, normalized_alias, language, platform_id)
      values(v_artist, trim(v_alias->>'name'), public.normalize_catalog_text(v_alias->>'name'), v_alias->>'locale', v_platform)
      on conflict (artist_id, normalized_alias, platform_id) do nothing;
    end loop;
    if not exists(select 1 from public.artist_verification_evidence where artist_id = v_artist and evidence_type = 'musicbrainz' and source_url = 'https://musicbrainz.org/artist/' || (v_item->>'id')) then
      insert into public.artist_verification_evidence(artist_id, evidence_type, source_url, payload, supports_country_code, notes)
      values(v_artist, 'musicbrainz', 'https://musicbrainz.org/artist/' || (v_item->>'id'), jsonb_build_object('runId', v_run, 'mbid', v_item->>'id'), 'MN',
        'MusicBrainz country association is a discovery hint, not proof of nationality or local status. Review identity before publishing.');
    end if;
    if v_new and v_curated is not null then
      insert into public.artist_verification_evidence(artist_id, evidence_type, source_url, payload, supports_locality, supports_country_code, notes, verified_at)
      values(v_artist, v_curated->>'evidenceType', v_curated->>'sourceUrl', jsonb_build_object('review_source', 'curated_import', 'checkedAt', v_curated->>'checkedAt', 'runId', v_run),
        'local', 'MN', v_curated->>'notes', now());
      insert into public.audit_logs(actor_type, action, entity_type, entity_id, after_data, reason, correlation_id)
      values('system', 'artist_curated_imported', 'artist', v_artist::text, v_curated,
        'Source cross-checked bootstrap manifest; no staff reviewer is impersonated.', v_run);
    end if;
  end loop;
  update public.artist_intelligence_runs set status = 'succeeded', completed_at = now(), profiles_updated = v_created where id = v_run;
  v_result := jsonb_build_object('runId', v_run, 'created', v_created, 'published', v_verified, 'pendingReview', v_created - v_verified, 'existingPreserved', v_existing, 'replayed', false);
  insert into public.audit_logs(actor_type, action, entity_type, entity_id, after_data, reason, correlation_id)
  values('system', 'artist_discovery_imported', 'artist_intelligence_run', v_run::text, v_result,
    'Explicit MusicBrainz discovery import; curated bootstrap only; no chart or audience data generated.', v_run);
  return v_result;
end;
$$;
revoke all on function public.import_musicbrainz_artists(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.import_musicbrainz_artists(jsonb, jsonb) to service_role;
comment on function public.import_musicbrainz_artists(jsonb, jsonb) is
  'Atomic, replay-safe MusicBrainz discovery. Optional explicit curated manifest applies only to new identities; subsequent imports preserve staff decisions. Retains source payload and audit evidence.';
