-- A4: YouTube calculations (youtube-metrics-v1), computed by
-- src/modules/youtube/calculations.ts and stored per calculation run.
-- A recalculation never edits an earlier run; for each date the newest run
-- covering it is current. Everything here is derived from YouTube statistics,
-- so it shares their retention (deleted at the end of the window, D5).

alter table public.pipeline_jobs drop constraint pipeline_jobs_kind_check;
alter table public.pipeline_jobs add constraint pipeline_jobs_kind_check
  check (kind in ('collect', 'calculate', 'artists', 'youtube_retention', 'youtube_discovery', 'youtube_daily_stats', 'youtube_calculate'));

insert into public.methodology_versions (code, title, notes, effective_from)
values ('youtube-metrics-v1', 'YouTube tracked metrics v1',
  'Views gained = views today minus the last approved views. A gap of more than one day is stored as one multi-day value and never split. Song totals sum verified links of official music video, official audio and lyric video (D4), each video once; artist totals count each song once. The Atlas YouTube Tracked Top 100 ranks songs by single-day views gained among songs whose counted videos all had a one-day interval: global views of tracked Mongolian-market videos, not Mongolia''s YouTube consumption. Momentum 0-100: position 60%, daily rise 25%, streak 15%. Engagement ratios are Atlas calculations.',
  '2026-11-16') on conflict (code) do nothing;

create table public.youtube_calculation_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.pipeline_jobs(id),
  from_date date not null,
  through_date date not null check (through_date >= from_date),
  formula_version text not null,
  inputs jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create trigger youtube_calculation_runs_append_only before update or delete on public.youtube_calculation_runs
  for each row execute function public.prevent_mutation();

create table public.youtube_song_daily (
  run_id uuid not null references public.youtube_calculation_runs(id),
  song_id uuid not null references public.songs(id),
  business_date date not null,
  views_gained bigint not null,
  interval_days integer not null check (interval_days >= 1),
  multi_day boolean not null,
  eligible boolean not null,
  by_kind jsonb not null,
  videos integer not null,
  primary key (run_id, song_id, business_date)
);
create table public.youtube_artist_daily (
  run_id uuid not null references public.youtube_calculation_runs(id),
  artist_id uuid not null references public.artists(id),
  business_date date not null,
  views_gained bigint not null,
  songs integer not null,
  multi_day boolean not null,
  primary key (run_id, artist_id, business_date)
);
create table public.youtube_chart_entries (
  run_id uuid not null references public.youtube_calculation_runs(id),
  chart_id uuid not null references public.charts(id) default '00000000-0000-0000-0000-000000000020',
  business_date date not null,
  rank integer not null check (rank between 1 and 100),
  song_id uuid not null references public.songs(id),
  views_gained bigint not null check (views_gained > 0),
  previous_rank integer,
  rank_change integer,
  peak_rank integer not null,
  days_on_chart integer not null,
  streak integer not null,
  momentum numeric(5,2) not null,
  primary key (run_id, business_date, rank),
  unique (run_id, business_date, song_id)
);
create table public.youtube_engagement (
  run_id uuid not null references public.youtube_calculation_runs(id),
  platform_asset_id uuid not null references public.youtube_video_assets(platform_asset_id),
  business_date date not null,
  likes_per_thousand numeric(10,2),
  comments_per_thousand numeric(10,2),
  primary key (run_id, platform_asset_id, business_date)
);
create table public.youtube_release_starts (
  run_id uuid not null references public.youtube_calculation_runs(id),
  platform_asset_id uuid not null references public.youtube_video_assets(platform_asset_id),
  song_id uuid not null references public.songs(id),
  published_at timestamptz not null,
  start jsonb not null,
  artist_average jsonb not null,
  compared_releases integer not null,
  primary key (run_id, platform_asset_id)
);
do $$ declare t text; begin
  foreach t in array array['youtube_song_daily', 'youtube_artist_daily', 'youtube_chart_entries', 'youtube_engagement', 'youtube_release_starts'] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.guard_source_evidence()', t || '_append_only', t);
  end loop;
  foreach t in array array['youtube_calculation_runs', 'youtube_song_daily', 'youtube_artist_daily', 'youtube_chart_entries', 'youtube_engagement', 'youtube_release_starts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "staff reads %s" on public.%I for select to authenticated using (public.staff_role() is not null)', t, t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

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
    elsif tg_op = 'DELETE' and tg_table_name in ('youtube_song_daily', 'youtube_artist_daily', 'youtube_chart_entries', 'youtube_engagement', 'youtube_release_starts') then
      -- Derived from YouTube statistics as a whole: always that retention class.
      return old;
    end if;
  end if;
  raise exception '% is append-only', tg_table_name;
end $$;

-- For each date, the newest run that covers it.
create view public.youtube_tracked_chart with (security_invoker = true) as
select e.* from public.youtube_chart_entries e
where e.run_id = (select r.id from public.youtube_calculation_runs r
                  where r.from_date <= e.business_date and r.through_date >= e.business_date
                  order by r.created_at desc, r.id desc limit 1);
create view public.youtube_song_daily_current with (security_invoker = true) as
select d.* from public.youtube_song_daily d
where d.run_id = (select r.id from public.youtube_calculation_runs r
                  where r.from_date <= d.business_date and r.through_date >= d.business_date
                  order by r.created_at desc, r.id desc limit 1);
create view public.youtube_artist_daily_current with (security_invoker = true) as
select d.* from public.youtube_artist_daily d
where d.run_id = (select r.id from public.youtube_calculation_runs r
                  where r.from_date <= d.business_date and r.through_date >= d.business_date
                  order by r.created_at desc, r.id desc limit 1);
grant select on public.youtube_tracked_chart, public.youtube_song_daily_current, public.youtube_artist_daily_current to authenticated;

create function public.enqueue_youtube_calculation(p_from date, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_job uuid;
begin
  insert into pipeline_jobs (kind, business_date, idempotency_key, reason)
  values ('youtube_calculate', p_from, 'youtube:calculate:' || p_from || ':' || md5(coalesce(p_reason, '') || clock_timestamp()::text), p_reason)
  returning id into v_job;
  return v_job;
end $$;
revoke all on function public.enqueue_youtube_calculation(date, text) from public, anon, authenticated;
grant execute on function public.enqueue_youtube_calculation(date, text) to service_role;

-- A successful statistics day queues that day's calculation.
create function public.queue_youtube_calculation_after_stats() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'youtube_daily_stats' and new.status = 'succeeded' and old.status is distinct from 'succeeded' then
    insert into pipeline_jobs (kind, business_date, idempotency_key, reason)
    values ('youtube_calculate', new.business_date, 'youtube:calculate:' || new.business_date || ':daily', 'Daily statistics collected')
    on conflict (idempotency_key) do nothing;
  end if;
  return new;
end $$;
create trigger pipeline_jobs_youtube_calculation after update of status on public.pipeline_jobs
  for each row execute function public.queue_youtube_calculation_after_stats();

-- A change to what a video counts for recalculates from its earliest statistics day.
create function public.queue_youtube_recalculation() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_from date;
begin
  select min(business_date) into v_from from youtube_video_statistics where platform_asset_id = new.platform_asset_id;
  if v_from is not null then
    perform enqueue_youtube_calculation(v_from, 'Video link, kind or verification changed');
  end if;
  return new;
end $$;
create trigger youtube_video_assets_recalculate after update of link_status, verification, asset_kind on public.youtube_video_assets
  for each row when (old.link_status is distinct from new.link_status or old.verification is distinct from new.verification or old.asset_kind is distinct from new.asset_kind)
  execute function public.queue_youtube_recalculation();
create function public.queue_youtube_recalculation_on_relink() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_from date;
begin
  select min(business_date) into v_from from youtube_video_statistics where platform_asset_id = new.id;
  if v_from is not null then
    perform enqueue_youtube_calculation(v_from, 'Video relinked to another recording');
  end if;
  return new;
end $$;
create trigger platform_assets_youtube_relink after update of recording_id on public.platform_assets
  for each row when (new.platform_id = '00000000-0000-0000-0000-000000000002' and old.recording_id is distinct from new.recording_id)
  execute function public.queue_youtube_recalculation_on_relink();

create function public.complete_youtube_calculation(p_job uuid, p_token uuid, p_through date, p_inputs jsonb,
  p_songs jsonb, p_artists jsonb, p_chart jsonb, p_engagement jsonb, p_releases jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare j pipeline_jobs; v_run uuid;
begin
  select * into j from pipeline_jobs where id = p_job and lease_token = p_token and lease_until > now() and status = 'running' and kind = 'youtube_calculate' for update;
  if not found then raise exception 'lost job lease'; end if;
  if p_through < j.business_date then p_through := j.business_date; end if;
  insert into youtube_calculation_runs (job_id, from_date, through_date, formula_version, inputs)
  values (p_job, j.business_date, p_through, 'youtube-metrics-v1', p_inputs) returning id into v_run;
  insert into youtube_song_daily select v_run, (x->>'songId')::uuid, (x->>'date')::date, (x->>'gained')::bigint, (x->>'intervalDays')::integer,
    (x->>'multiDay')::boolean, (x->>'eligible')::boolean, x->'byKind', (x->>'videos')::integer
    from jsonb_array_elements(p_songs) x where (x->>'date')::date >= j.business_date;
  insert into youtube_artist_daily select v_run, (x->>'artistId')::uuid, (x->>'date')::date, (x->>'gained')::bigint, (x->>'songs')::integer, (x->>'multiDay')::boolean
    from jsonb_array_elements(p_artists) x where (x->>'date')::date >= j.business_date;
  insert into youtube_chart_entries (run_id, business_date, rank, song_id, views_gained, previous_rank, rank_change, peak_rank, days_on_chart, streak, momentum)
    select v_run, (x->>'date')::date, (x->>'rank')::integer, (x->>'songId')::uuid, (x->>'gained')::bigint, (x->>'previousRank')::integer,
      (x->>'rankChange')::integer, (x->>'peakRank')::integer, (x->>'daysOnChart')::integer, (x->>'streak')::integer, (x->>'momentum')::numeric
    from jsonb_array_elements(p_chart) x where (x->>'date')::date >= j.business_date;
  insert into youtube_engagement select v_run, (x->>'assetId')::uuid, (x->>'date')::date, (x->>'likesPerThousand')::numeric, (x->>'commentsPerThousand')::numeric
    from jsonb_array_elements(p_engagement) x;
  insert into youtube_release_starts select v_run, (x->>'assetId')::uuid, (x->>'songId')::uuid, (x->>'publishedAt')::timestamptz, x->'start', x->'artistAverage', (x->>'comparedReleases')::integer
    from jsonb_array_elements(p_releases) x;
  update pipeline_jobs set status = 'succeeded', completed_at = now(), lease_until = null where id = p_job;
  insert into audit_logs (action, entity_type, entity_id, after_data, reason)
  values ('youtube_calculation.completed', 'youtube_calculation_run', v_run::text,
          jsonb_build_object('from', j.business_date, 'through', p_through, 'songs', jsonb_array_length(p_songs), 'chartEntries', jsonb_array_length(p_chart)), coalesce(j.reason, 'Daily calculation'));
  return v_run;
end $$;
revoke all on function public.complete_youtube_calculation(uuid, uuid, date, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.complete_youtube_calculation(uuid, uuid, date, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;

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
