create function public.normalize_catalog_text(value text) returns text
language sql
immutable
parallel safe
as $$
  select trim(regexp_replace(lower(coalesce(value, '')), '[^[:alnum:]]+', ' ', 'g'));
$$;

create function public.ingest_apple_music_snapshot(
  p_job_id uuid,
  p_snapshot_date date,
  p_source_timestamp timestamptz,
  p_checksum text,
  p_source_url text,
  p_payload jsonb,
  p_entries jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_chart_id uuid;
  v_platform_id uuid;
  v_methodology_id uuid;
  v_expected_count integer;
  v_raw_payload_id uuid;
  v_snapshot_id uuid;
  v_entry jsonb;
  v_artist_id uuid;
  v_song_id uuid;
  v_recording_id uuid;
  v_asset_id uuid;
  v_chart_entry_id uuid;
  v_prior_rank integer;
  v_prior_peak integer;
  v_prior_days integer;
  v_entry_status public.entry_status;
  v_rank_change integer;
  v_momentum numeric(5,2);
  v_signal_id uuid;
begin
  select c.id, c.platform_id, c.maximum_entries
  into v_chart_id, v_platform_id, v_expected_count
  from public.charts c
  where c.slug = 'apple-music-mongolia' and c.active;

  if v_chart_id is null then
    raise exception 'active Apple Music Mongolia chart is not configured';
  end if;

  if not exists (
    select 1 from public.collection_jobs
    where id = p_job_id and chart_id = v_chart_id
  ) then
    raise exception 'collection job does not belong to Apple Music Mongolia chart';
  end if;

  if jsonb_typeof(p_entries) <> 'array' then
    raise exception 'entries must be a JSON array';
  end if;

  if jsonb_array_length(p_entries) <> v_expected_count then
    raise exception 'expected % entries, received %', v_expected_count, jsonb_array_length(p_entries);
  end if;

  if exists (
    select 1
    from (
      select (item ->> 'rank')::integer as rank, item ->> 'itemId' as item_id
      from jsonb_array_elements(p_entries) item
    ) entries
    group by rank
    having count(*) > 1
  ) then
    raise exception 'duplicate ranks in collection payload';
  end if;

  if exists (
    select 1
    from (
      select item ->> 'itemId' as item_id
      from jsonb_array_elements(p_entries) item
    ) entries
    group by item_id
    having count(*) > 1
  ) then
    raise exception 'duplicate Apple Music item IDs in collection payload';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_chart_id::text || ':' || p_snapshot_date::text));

  if exists (
    select 1 from public.chart_snapshots
    where chart_id = v_chart_id
      and snapshot_date = p_snapshot_date
      and status = 'approved'
  ) then
    raise exception 'an approved snapshot already exists for %', p_snapshot_date;
  end if;

  select id into v_methodology_id
  from public.methodology_versions
  where code = 'apple-music-rank-v1'
    and effective_from <= p_snapshot_date
    and (effective_until is null or effective_until >= p_snapshot_date)
  order by effective_from desc
  limit 1;

  update public.collection_jobs
  set status = 'running', started_at = coalesce(started_at, now())
  where id = p_job_id;

  insert into public.raw_payloads (
    collection_job_id,
    source_url,
    source_timestamp,
    checksum,
    payload
  ) values (
    p_job_id,
    p_source_url,
    p_source_timestamp,
    p_checksum,
    p_payload
  ) returning id into v_raw_payload_id;

  insert into public.chart_snapshots (
    chart_id,
    collection_job_id,
    raw_payload_id,
    methodology_version_id,
    snapshot_date,
    collected_at,
    source_timestamp,
    entry_count,
    status,
    checksum,
    is_complete
  ) values (
    v_chart_id,
    p_job_id,
    v_raw_payload_id,
    v_methodology_id,
    p_snapshot_date,
    now(),
    p_source_timestamp,
    jsonb_array_length(p_entries),
    'candidate',
    p_checksum,
    false
  ) returning id into v_snapshot_id;

  for v_entry in
    select item
    from jsonb_array_elements(p_entries) item
    order by (item ->> 'rank')::integer
  loop
    insert into public.artists (
      canonical_name,
      sort_name,
      source_key,
      verification
    ) values (
      v_entry ->> 'artistName',
      public.normalize_catalog_text(v_entry ->> 'artistName'),
      'apple_music:' || coalesce(
        nullif(v_entry ->> 'artistId', ''),
        'name:' || md5(public.normalize_catalog_text(v_entry ->> 'artistName'))
      ),
      'suggested'
    )
    on conflict (source_key) do update
      set updated_at = now(),
          canonical_name = case
            when artists.verification = 'suggested' then excluded.canonical_name
            else artists.canonical_name
          end
    returning id into v_artist_id;

    insert into public.songs (
      canonical_title,
      normalized_title,
      source_key,
      primary_artist_id,
      release_date,
      genre,
      explicit,
      verification,
      artwork_url
    ) values (
      v_entry ->> 'title',
      public.normalize_catalog_text(v_entry ->> 'title'),
      'apple_music:' || (v_entry ->> 'itemId'),
      v_artist_id,
      nullif(v_entry ->> 'releaseDate', '')::date,
      nullif(v_entry ->> 'primaryGenre', ''),
      case when v_entry ? 'contentRating' then (v_entry ->> 'contentRating') = 'explicit' else null end,
      'suggested',
      nullif(v_entry ->> 'artworkUrl', '')
    )
    on conflict (source_key) do update
      set updated_at = now(),
          canonical_title = case
            when songs.verification = 'suggested' then excluded.canonical_title
            else songs.canonical_title
          end,
          primary_artist_id = coalesce(songs.primary_artist_id, excluded.primary_artist_id),
          artwork_url = coalesce(excluded.artwork_url, songs.artwork_url)
    returning id into v_song_id;

    insert into public.song_artists (song_id, artist_id, credit_role, credit_order)
    values (v_song_id, v_artist_id, 'primary', 0)
    on conflict do nothing;

    select pa.recording_id into v_recording_id
    from public.platform_assets pa
    where pa.platform_id = v_platform_id
      and pa.platform_item_id = v_entry ->> 'itemId';

    if v_recording_id is null then
      insert into public.recordings (
        song_id,
        isrc,
        duration_ms,
        release_date,
        recording_type
      ) values (
        v_song_id,
        nullif(v_entry ->> 'isrc', ''),
        nullif(v_entry ->> 'durationMs', '')::integer,
        nullif(v_entry ->> 'releaseDate', '')::date,
        'original'
      ) returning id into v_recording_id;
    end if;

    insert into public.platform_assets (
      platform_id,
      recording_id,
      platform_item_id,
      platform_url,
      platform_artist_id,
      platform_artist_name,
      platform_title,
      platform_album,
      artwork_url,
      duration_ms,
      raw_metadata
    ) values (
      v_platform_id,
      v_recording_id,
      v_entry ->> 'itemId',
      nullif(v_entry ->> 'url', ''),
      nullif(v_entry ->> 'artistId', ''),
      v_entry ->> 'artistName',
      v_entry ->> 'title',
      nullif(v_entry ->> 'albumName', ''),
      nullif(v_entry ->> 'artworkUrl', ''),
      nullif(v_entry ->> 'durationMs', '')::integer,
      v_entry
    )
    on conflict (platform_id, platform_item_id) do update
      set recording_id = coalesce(platform_assets.recording_id, excluded.recording_id),
          platform_url = excluded.platform_url,
          platform_artist_id = excluded.platform_artist_id,
          platform_artist_name = excluded.platform_artist_name,
          platform_title = excluded.platform_title,
          platform_album = excluded.platform_album,
          artwork_url = excluded.artwork_url,
          duration_ms = excluded.duration_ms,
          last_seen_at = now(),
          raw_metadata = excluded.raw_metadata
    returning id into v_asset_id;

    select ce.rank
    into v_prior_rank
    from public.chart_entries ce
    join public.chart_snapshots cs on cs.id = ce.snapshot_id
    where cs.chart_id = v_chart_id
      and cs.status = 'approved'
      and cs.snapshot_date < p_snapshot_date
      and ce.song_id = v_song_id
    order by cs.snapshot_date desc
    limit 1;

    select min(ce.rank), count(*)::integer
    into v_prior_peak, v_prior_days
    from public.chart_entries ce
    join public.chart_snapshots cs on cs.id = ce.snapshot_id
    where cs.chart_id = v_chart_id
      and cs.status = 'approved'
      and cs.snapshot_date < p_snapshot_date
      and ce.song_id = v_song_id;

    v_rank_change := case
      when v_prior_rank is null then null
      else v_prior_rank - (v_entry ->> 'rank')::integer
    end;

    if v_prior_days = 0 then
      v_entry_status := 'new';
    elsif v_prior_rank is null then
      v_entry_status := 're_entry';
    elsif v_rank_change > 0 then
      v_entry_status := 'up';
    elsif v_rank_change < 0 then
      v_entry_status := 'down';
    else
      v_entry_status := 'unchanged';
    end if;

    v_momentum := least(
      100,
      greatest(
        0,
        round((
          45 * ((101 - (v_entry ->> 'rank')::integer)::numeric / 100)
          + 40 * least(greatest(coalesce(v_rank_change, 0), 0), 25)::numeric / 25
          + 15 * case when v_prior_peak is null or (v_entry ->> 'rank')::integer < v_prior_peak then 1 else 0 end
        ), 2)
      )
    );

    insert into public.chart_entries (
      snapshot_id,
      platform_asset_id,
      song_id,
      rank,
      previous_rank,
      rank_change,
      entry_status,
      peak_rank,
      days_on_chart,
      momentum_score,
      raw_metadata
    ) values (
      v_snapshot_id,
      v_asset_id,
      v_song_id,
      (v_entry ->> 'rank')::integer,
      v_prior_rank,
      v_rank_change,
      v_entry_status,
      least(coalesce(v_prior_peak, (v_entry ->> 'rank')::integer), (v_entry ->> 'rank')::integer),
      coalesce(v_prior_days, 0) + 1,
      v_momentum,
      v_entry
    ) returning id into v_chart_entry_id;

    v_signal_id := null;

    if (v_entry ->> 'rank')::integer = 1 and coalesce(v_prior_rank, 0) <> 1 then
      insert into public.signals (
        signal_type, song_id, artist_id, chart_id, snapshot_id,
        severity, confidence, headline_summary, rule_version
      ) values (
        'new_number_one', v_song_id, v_artist_id, v_chart_id, v_snapshot_id,
        'high', 1, (v_entry ->> 'title') || ' reaches No. 1', 'signals-v1'
      ) returning id into v_signal_id;
    elsif coalesce(v_rank_change, 0) >= 20 then
      insert into public.signals (
        signal_type, song_id, artist_id, chart_id, snapshot_id,
        severity, confidence, headline_summary, rule_version
      ) values (
        'rank_jump_20', v_song_id, v_artist_id, v_chart_id, v_snapshot_id,
        case when (v_entry ->> 'rank')::integer <= 20 then 'high'::public.severity else 'medium'::public.severity end,
        1,
        (v_entry ->> 'title') || ' rises ' || v_rank_change || ' positions',
        'signals-v1'
      ) returning id into v_signal_id;
    elsif (v_entry ->> 'rank')::integer <= 10 and coalesce(v_prior_peak, 101) > 10 then
      insert into public.signals (
        signal_type, song_id, artist_id, chart_id, snapshot_id,
        severity, confidence, headline_summary, rule_version
      ) values (
        'new_top_10', v_song_id, v_artist_id, v_chart_id, v_snapshot_id,
        'high', 1, (v_entry ->> 'title') || ' enters the Top 10', 'signals-v1'
      ) returning id into v_signal_id;
    end if;

    if v_signal_id is not null then
      insert into public.signal_evidence (signal_id, chart_entry_id, evidence_type, payload)
      values (
        v_signal_id,
        v_chart_entry_id,
        'chart_movement',
        jsonb_build_object(
          'rank', (v_entry ->> 'rank')::integer,
          'previousRank', v_prior_rank,
          'rankChange', v_rank_change,
          'snapshotDate', p_snapshot_date
        )
      );
    end if;
  end loop;

  if (select count(*) from public.chart_entries where snapshot_id = v_snapshot_id) <> v_expected_count then
    raise exception 'snapshot entry count failed after ingestion';
  end if;

  update public.chart_snapshots
  set status = 'approved', is_complete = true, approved_at = now()
  where id = v_snapshot_id;

  update public.collection_jobs
  set status = 'succeeded',
      completed_at = now(),
      items_received = v_expected_count,
      error_code = null,
      error_message = null
  where id = p_job_id;

  insert into public.audit_logs (
    actor_type,
    action,
    entity_type,
    entity_id,
    after_data,
    correlation_id
  )
  select
    'system',
    'snapshot.approved',
    'chart_snapshot',
    v_snapshot_id::text,
    jsonb_build_object(
      'chartId', v_chart_id,
      'snapshotDate', p_snapshot_date,
      'entryCount', v_expected_count,
      'checksum', p_checksum
    ),
    correlation_id
  from public.collection_jobs
  where id = p_job_id;

  return v_snapshot_id;
end;
$$;

revoke all on function public.ingest_apple_music_snapshot(uuid, date, timestamptz, text, text, jsonb, jsonb) from public;
revoke all on function public.ingest_apple_music_snapshot(uuid, date, timestamptz, text, text, jsonb, jsonb) from anon;
revoke all on function public.ingest_apple_music_snapshot(uuid, date, timestamptz, text, text, jsonb, jsonb) from authenticated;
grant execute on function public.ingest_apple_music_snapshot(uuid, date, timestamptz, text, text, jsonb, jsonb) to service_role;
