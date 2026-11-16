-- A5: YouTube's Mongolia trending music list as a discovery feed.
--
-- Probe on 16 November 2026 (scripts/probe-mostpopular.mjs): category 10 for
-- regionCode MN returned 30 videos from 26 channels, 17 of them recognisably
-- Mongolian; all categories returned 50, 34 Mongolian. Meaningful, so the
-- feed is on. It is a discovery source and an editorial fact ("on YouTube's
-- trending music list"), never a ranking of Mongolian consumption.

insert into public.methodology_configuration (code, parameters)
values ('youtube-trending-v1', '{"enabled": true, "regionCode": "MN", "videoCategoryId": "10", "maxResults": 50}')
on conflict (code) do nothing;
insert into public.methodology_versions (code, title, notes, effective_from)
values ('youtube-trending-v1', 'YouTube trending music list (Mongolia)',
  'Positions on YouTube''s own trending music list for Mongolia (videos.list chart=mostPopular, regionCode MN, category 10), recorded daily with discovery. Used to find candidate videos and as the fact "on YouTube''s trending music list". Not a ranking of what Mongolia watches. YouTube data: kept 30 days.',
  '2026-11-16') on conflict (code) do nothing;

create table public.youtube_trending_entries (
  business_date date not null,
  position integer not null check (position between 1 and 200),
  platform_asset_id uuid not null references public.youtube_video_assets(platform_asset_id),
  job_id uuid not null references public.pipeline_jobs(id),
  attempt_id uuid not null references public.collection_attempts(id),
  created_at timestamptz not null default now(),
  primary key (business_date, position),
  unique (business_date, platform_asset_id)
);
create trigger youtube_trending_entries_append_only before update or delete on public.youtube_trending_entries
  for each row execute function public.guard_source_evidence();
alter table public.youtube_trending_entries enable row level security;
create policy "staff reads trending entries" on public.youtube_trending_entries for select to authenticated using (public.staff_role() is not null);
grant select on public.youtube_trending_entries to authenticated;

create or replace function public.guard_source_evidence() returns trigger
language plpgsql as $$
declare
  kept text[] := array['payload', 'raw_body', 'purged_at', 'purge_run_id'];
begin
  -- Nested IFs on purpose: PL/pgSQL does not short-circuit AND when it
  -- resolves record fields, and artist_metric_snapshots has no purged_at.
  if current_setting('atlas.retention', true) = 'purge' then
    if tg_op = 'UPDATE' and tg_table_name in ('artist_source_payloads', 'raw_payloads', 'collection_attempts') then
      if to_jsonb(old)->>'retention_class' <> 'permanent'
         and to_jsonb(old)->>'purged_at' is null and to_jsonb(new)->>'purged_at' is not null
         and (to_jsonb(new) - kept) = (to_jsonb(old) - kept) then
        return new;
      end if;
    elsif tg_op = 'DELETE' and tg_table_name in ('artist_metric_snapshots', 'youtube_video_statistics') then
      if to_jsonb(old)->>'retention_class' = 'youtube_statistics' then
        return old;
      end if;
    elsif tg_op = 'DELETE' and tg_table_name in ('youtube_song_daily', 'youtube_artist_daily', 'youtube_chart_entries', 'youtube_engagement', 'youtube_release_starts', 'youtube_trending_entries') then
      -- Derived from YouTube statistics as a whole: always that retention class.
      return old;
    end if;
  end if;
  raise exception '% is append-only', tg_table_name;
end $$;

create function public.record_youtube_trending(p_job uuid, p_token uuid, p_attempt uuid, p_video_ids jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare j pipeline_jobs; v_count integer;
begin
  select * into j from pipeline_jobs where id = p_job and lease_token = p_token and lease_until > now() and status = 'running' and kind = 'youtube_discovery';
  if not found then raise exception 'lost job lease'; end if;
  if not exists (select 1 from collection_attempts where id = p_attempt and job_id = p_job and http_status = 200) then raise exception 'missing source evidence'; end if;
  insert into youtube_trending_entries (business_date, position, platform_asset_id, job_id, attempt_id)
  select j.business_date, x.ord::integer, y.platform_asset_id, p_job, p_attempt
  from jsonb_array_elements_text(p_video_ids) with ordinality x(video_id, ord)
  join youtube_video_assets y on y.video_id = x.video_id
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.record_youtube_trending(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_youtube_trending(uuid, uuid, uuid, jsonb) to service_role;

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

  -- 7. Daily YouTube video statistics (A3): delete at the end of the window.
  select count(*), min(business_date), max(business_date) into v_n, v_dfrom, v_dthrough
  from youtube_video_statistics where business_date < v_statistics_cutoff;
  if v_n > 0 then
    delete from youtube_video_statistics where business_date < v_statistics_cutoff;
    insert into audit_logs (action, entity_type, entity_id, after_data, reason, correlation_id)
    values ('youtube_retention_purge', 'youtube_video_statistics', v_run::text,
      jsonb_build_object('count', v_n, 'retentionClass', 'youtube_statistics', 'operation', 'delete', 'from', v_dfrom, 'through', v_dthrough),
      'YouTube API data retention limit', v_run);
  end if;
  v_counts := v_counts || jsonb_build_object('youtubeVideoStatistics', v_n);

  -- 8. Atlas metrics derived from YouTube statistics (A4): same window.
  --    D5: summaries are deleted too until an accepted policy allows them.
  select count(*) into v_n from (
    select 1 from youtube_song_daily where business_date < v_statistics_cutoff
    union all select 1 from youtube_artist_daily where business_date < v_statistics_cutoff
    union all select 1 from youtube_chart_entries where business_date < v_statistics_cutoff
    union all select 1 from youtube_engagement where business_date < v_statistics_cutoff
    union all select 1 from youtube_release_starts where published_at::date < v_statistics_cutoff) x;
  if v_n > 0 then
    delete from youtube_song_daily where business_date < v_statistics_cutoff;
    delete from youtube_artist_daily where business_date < v_statistics_cutoff;
    delete from youtube_chart_entries where business_date < v_statistics_cutoff;
    delete from youtube_engagement where business_date < v_statistics_cutoff;
    delete from youtube_release_starts where published_at::date < v_statistics_cutoff;
    insert into audit_logs (action, entity_type, entity_id, after_data, reason, correlation_id)
    values ('youtube_retention_purge', 'youtube_derived_metrics', v_run::text,
      jsonb_build_object('count', v_n, 'retentionClass', 'youtube_statistics', 'operation', 'delete', 'through', v_statistics_cutoff),
      'YouTube API data retention limit (derived metrics, D5)', v_run);
  end if;
  v_counts := v_counts || jsonb_build_object('youtubeDerivedMetrics', v_n);

  -- 9. YouTube's trending-list positions (A5): YouTube data, 30-day clock.
  select count(*), min(business_date), max(business_date) into v_n, v_dfrom, v_dthrough
  from youtube_trending_entries where business_date < (v_metadata_cutoff at time zone 'Asia/Ulaanbaatar')::date;
  if v_n > 0 then
    delete from youtube_trending_entries where business_date < (v_metadata_cutoff at time zone 'Asia/Ulaanbaatar')::date;
    insert into audit_logs (action, entity_type, entity_id, after_data, reason, correlation_id)
    values ('youtube_retention_purge', 'youtube_trending_entries', v_run::text,
      jsonb_build_object('count', v_n, 'retentionClass', 'youtube_metadata', 'operation', 'delete', 'from', v_dfrom, 'through', v_dthrough),
      'YouTube API data retention limit', v_run);
  end if;
  v_counts := v_counts || jsonb_build_object('youtubeTrendingEntries', v_n);

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
