-- A3: daily YouTube statistics collector.
--
-- One evidence-backed statistics row per tracked video per business date,
-- from the active watchlist. Never backfilled: a missed day stays a gap.
-- A view count below the last approved value is an anomaly, not a fact.
-- Videos the API no longer returns are recorded as missing (deleted or
-- private), never dropped silently. Rows are youtube_statistics and are
-- deleted by the retention job at the end of the active window.

alter table public.pipeline_jobs drop constraint pipeline_jobs_kind_check;
alter table public.pipeline_jobs add constraint pipeline_jobs_kind_check
  check (kind in ('collect', 'calculate', 'artists', 'youtube_retention', 'youtube_discovery', 'youtube_daily_stats'));

-- The tracked-catalogue chart (A4 ranks it). Inactive: dashboard only (D3).
insert into public.charts (id, platform_id, slug, name, country_code, chart_type, frequency, maximum_entries, active)
values ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000002', 'youtube-tracked-mn',
        'Atlas YouTube Tracked Top 100 (global views of tracked Mongolian-market videos)', 'MN', 'songs', 'daily', 100, false)
on conflict (slug) do nothing;

create table public.youtube_video_statistics (
  id uuid primary key default gen_random_uuid(),
  platform_asset_id uuid not null references public.youtube_video_assets(platform_asset_id),
  business_date date not null,
  fetched_at timestamptz not null,
  view_count bigint check (view_count is null or view_count >= 0),
  like_count bigint check (like_count is null or like_count >= 0),
  comment_count bigint check (comment_count is null or comment_count >= 0),
  availability text not null check (availability in ('available', 'missing', 'private')),
  status text not null check (status in ('approved', 'anomaly')),
  anomaly_code text,
  job_id uuid not null references public.pipeline_jobs(id),
  attempt_id uuid not null references public.collection_attempts(id),
  retention_class public.retention_class not null default 'youtube_statistics' check (retention_class = 'youtube_statistics'),
  created_at timestamptz not null default now(),
  unique (platform_asset_id, business_date),
  check (availability = 'available' or (view_count is null and like_count is null and comment_count is null))
);
create index youtube_video_statistics_date_idx on public.youtube_video_statistics (business_date desc);
create trigger youtube_video_statistics_append_only before update or delete on public.youtube_video_statistics
  for each row execute function public.guard_source_evidence();
alter table public.youtube_video_statistics enable row level security;
create policy "staff reads youtube statistics" on public.youtube_video_statistics
  for select to authenticated using (public.staff_role() is not null);
grant select on public.youtube_video_statistics to authenticated;

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
    end if;
  end if;
  raise exception '% is append-only', tg_table_name;
end $$;

insert into public.methodology_versions (code, title, notes, effective_from)
values ('youtube-stats-v1', 'YouTube daily statistics v1',
  'Global public counts (views, likes, comments) of tracked videos, collected once per business date at 05:30 Asia/Ulaanbaatar. A view count below the last approved value is held as an anomaly. Missing videos are recorded as missing. View counting changed on 2025-03-31 (Shorts) and 2026-08-27 (all formats); comparisons across those dates mix methods.',
  '2026-11-16') on conflict (code) do nothing;
insert into public.methodology_configuration (code, parameters)
values ('youtube-view-methodology-breaks', jsonb_build_object('breaks', jsonb_build_array(
  jsonb_build_object('date', '2025-03-31', 'scope', 'shorts', 'note', 'Shorts views count when playback starts'),
  jsonb_build_object('date', '2026-08-27', 'scope', 'all', 'note', 'Long-form, Live and Shorts views count when playback starts'))))
on conflict (code) do nothing;

create function public.enqueue_youtube_stats(p_date date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_date date := coalesce(p_date, (now() at time zone 'Asia/Ulaanbaatar')::date);
  v_job uuid;
begin
  if v_date <> (now() at time zone 'Asia/Ulaanbaatar')::date then raise exception 'YouTube statistics cannot be backfilled'; end if;
  insert into pipeline_jobs (kind, business_date, idempotency_key)
  values ('youtube_daily_stats', v_date, 'youtube:stats:' || v_date)
  on conflict (idempotency_key) do update set idempotency_key = excluded.idempotency_key
  returning id into v_job;
  return v_job;
end $$;
revoke all on function public.enqueue_youtube_stats(date) from public, anon, authenticated;
grant execute on function public.enqueue_youtube_stats(date) to service_role;

-- Stores one day's statistics from one retained attempt. Re-checks every rule
-- the worker applied; the database is the authority.
create function public.complete_youtube_stats(p_job uuid, p_token uuid, p_attempt uuid, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  j pipeline_jobs;
  r jsonb;
  v_asset uuid;
  v_prev bigint;
  v_status text;
  v_code text;
  v_views bigint;
  v_counts jsonb := '{"approved":0,"anomaly":0,"missing":0,"private":0,"requested":0}';
  v_fetched timestamptz;
begin
  select * into j from pipeline_jobs where id = p_job and lease_token = p_token and lease_until > now() and status = 'running' and kind = 'youtube_daily_stats' for update;
  if not found then raise exception 'lost job lease'; end if;
  select received_at into v_fetched from collection_attempts where id = p_attempt and job_id = p_job and lease_token = p_token and http_status = 200;
  if not found then raise exception 'missing source evidence'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid statistics batch'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    select platform_asset_id into v_asset from youtube_video_assets where video_id = r->>'videoId';
    if v_asset is null then raise exception 'unknown video %', r->>'videoId'; end if;
    v_counts := jsonb_set(v_counts, '{requested}', to_jsonb((v_counts->>'requested')::integer + 1));
    if r->>'availability' not in ('available', 'missing', 'private') then raise exception 'invalid availability'; end if;
    v_status := 'approved'; v_code := null; v_views := null;
    if r->>'availability' = 'available' then
      if coalesce(r->>'viewCount', '') !~ '^[0-9]+$'
         or (r ? 'likeCount' and r->>'likeCount' is not null and r->>'likeCount' !~ '^[0-9]+$')
         or (r ? 'commentCount' and r->>'commentCount' is not null and r->>'commentCount' !~ '^[0-9]+$') then
        raise exception 'counts must be non-negative integers';
      end if;
      v_views := (r->>'viewCount')::bigint;
      select view_count into v_prev from youtube_video_statistics
        where platform_asset_id = v_asset and status = 'approved' and business_date < j.business_date and view_count is not null
        order by business_date desc limit 1;
      if v_prev is not null and v_views < v_prev then
        v_status := 'anomaly'; v_code := 'impossible_metric_movement';
        insert into anomaly_alerts (chart_id, platform_asset_id, anomaly_type, severity, summary, expected_value, observed_value, evidence)
        values ('00000000-0000-0000-0000-000000000020', v_asset, 'impossible_metric_movement', 'medium',
                'YouTube view count fell below its last approved value', jsonb_build_object('minimumViews', v_prev),
                jsonb_build_object('views', v_views), jsonb_build_object('jobId', p_job, 'attemptId', p_attempt, 'videoId', r->>'videoId', 'businessDate', j.business_date));
      end if;
      -- Refresh metadata (titles expire after 30 days unless refreshed).
      if r ? 'title' and length(coalesce(r->>'title', '')) between 1 and 500 then
        update platform_assets set platform_title = r->>'title',
          platform_artist_name = coalesce(nullif(r->>'channelTitle', ''), platform_artist_name), last_seen_at = now()
          where id = v_asset;
        update youtube_video_assets set metadata_refreshed_at = now(), metadata_purged_at = null,
          duration_seconds = coalesce((r->>'durationSeconds')::integer, duration_seconds),
          published_at = coalesce((r->>'publishedAt')::timestamptz, published_at), updated_at = now()
          where platform_asset_id = v_asset;
      end if;
    end if;
    insert into youtube_video_statistics (platform_asset_id, business_date, fetched_at, view_count, like_count, comment_count, availability, status, anomaly_code, job_id, attempt_id)
    values (v_asset, j.business_date, v_fetched, v_views,
            case when r->>'availability' = 'available' then (r->>'likeCount')::bigint end,
            case when r->>'availability' = 'available' then (r->>'commentCount')::bigint end,
            r->>'availability', v_status, v_code, p_job, p_attempt)
    on conflict (platform_asset_id, business_date) do nothing;
    if r->>'availability' = 'available' then
      v_counts := jsonb_set(v_counts, array[v_status], to_jsonb((v_counts->>v_status)::integer + 1));
    else
      v_counts := jsonb_set(v_counts, array[r->>'availability'], to_jsonb((v_counts->>(r->>'availability'))::integer + 1));
    end if;
  end loop;
  -- Partial success is allowed but visible: the job carries the counts.
  update pipeline_jobs set status = 'succeeded', completed_at = now(), lease_until = null,
    error_code = case when (v_counts->>'approved')::integer < (v_counts->>'requested')::integer then 'partial' end,
    error_message = case when (v_counts->>'approved')::integer < (v_counts->>'requested')::integer
      then format('%s of %s videos approved; %s missing, %s private, %s anomalies', v_counts->>'approved', v_counts->>'requested', v_counts->>'missing', v_counts->>'private', v_counts->>'anomaly') end
    where id = p_job;
  insert into audit_logs (action, entity_type, entity_id, after_data, reason)
  values ('youtube_stats.collected', 'pipeline_job', p_job::text, v_counts, 'Daily YouTube statistics');
  return v_counts;
end $$;
revoke all on function public.complete_youtube_stats(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.complete_youtube_stats(uuid, uuid, uuid, jsonb) to service_role;

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
