-- A1: YouTube retention and compliance model.
--
-- YouTube API data fetched with an API key may be kept for at most 30 days
-- unless refreshed. Under an accepted derived-metrics amendment, statistics
-- (and Atlas metrics derived from them) may be kept for up to 36 calendar
-- months; titles, descriptions, channel names and thumbnails still expire
-- after 30 days. This is the one documented exception to "history is
-- immutable": it is handled by an explicit, audited job, never silently.
--
-- * retention_class labels every source row: permanent (Apple Music, Atlas
--   facts), youtube_statistics, youtube_metadata.
-- * Expired raw YouTube payloads become tombstones: the row, its checksum and
--   fetch time stay so evidence links keep resolving, the content is removed.
-- * Expired YouTube statistics rows are deleted, with an audit row per batch.
-- * The active mode (30_day / 36_month) is configuration, changed only through
--   an audited methodology version.

create type public.retention_class as enum ('permanent', 'youtube_statistics', 'youtube_metadata');

-- Source evidence columns ---------------------------------------------------

alter table public.artist_source_payloads
  add column retention_class public.retention_class not null default 'permanent',
  add column purged_at timestamptz,
  add column purge_run_id uuid;
alter table public.raw_payloads
  add column retention_class public.retention_class not null default 'permanent',
  add column purged_at timestamptz,
  add column purge_run_id uuid;
alter table public.collection_attempts
  add column retention_class public.retention_class not null default 'permanent',
  add column purged_at timestamptz,
  add column purge_run_id uuid;
alter table public.artist_metric_snapshots
  add column retention_class public.retention_class not null default 'permanent';

-- Classify existing YouTube rows. The append-only triggers are suspended only
-- for this one-off, schema-owner backfill inside the migration transaction.
alter table public.artist_source_payloads disable trigger artist_source_payloads_append_only;
update public.artist_source_payloads p set retention_class = 'youtube_metadata'
from public.artist_intelligence_runs r
where r.id = p.run_id and r.source_platform_id = '00000000-0000-0000-0000-000000000002';
alter table public.artist_source_payloads enable trigger artist_source_payloads_append_only;

alter table public.artist_metric_snapshots disable trigger artist_metric_snapshots_append_only;
update public.artist_metric_snapshots set retention_class = 'youtube_statistics'
where platform_id = '00000000-0000-0000-0000-000000000002';
alter table public.artist_metric_snapshots enable trigger artist_metric_snapshots_append_only;

create index artist_source_payloads_retention_idx on public.artist_source_payloads (received_at)
  where retention_class <> 'permanent' and purged_at is null;
create index raw_payloads_retention_idx on public.raw_payloads (received_at)
  where retention_class <> 'permanent' and purged_at is null;
create index collection_attempts_retention_idx on public.collection_attempts (received_at)
  where retention_class <> 'permanent' and purged_at is null;
create index artist_metric_snapshots_retention_idx on public.artist_metric_snapshots (metric_date)
  where retention_class = 'youtube_statistics';

-- New rows are classified by the database, so a collector cannot forget.
-- Raw YouTube responses carry titles and channel names, so they are
-- youtube_metadata (the shorter, 30-day clock) in both modes.
create function public.assign_retention_class() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'artist_source_payloads' then
    if exists (select 1 from artist_intelligence_runs r where r.id = new.run_id
               and r.source_platform_id = '00000000-0000-0000-0000-000000000002') then
      new.retention_class := 'youtube_metadata';
    end if;
  elsif tg_table_name = 'raw_payloads' then
    if exists (select 1 from collection_jobs j join charts c on c.id = j.chart_id
               where j.id = new.collection_job_id and c.platform_id = '00000000-0000-0000-0000-000000000002') then
      new.retention_class := 'youtube_metadata';
    end if;
  elsif tg_table_name = 'collection_attempts' then
    if exists (select 1 from pipeline_jobs j where j.id = new.job_id and j.kind like 'youtube%') then
      new.retention_class := 'youtube_metadata';
    end if;
  end if;
  new.purged_at := null;
  new.purge_run_id := null;
  return new;
end $$;

-- artist_metric_snapshots has no purge columns; give it its own small trigger.
create function public.assign_metric_retention_class() returns trigger
language plpgsql as $$
begin
  if new.platform_id = '00000000-0000-0000-0000-000000000002' then
    new.retention_class := 'youtube_statistics';
  else
    new.retention_class := 'permanent';
  end if;
  return new;
end $$;

create trigger artist_source_payloads_retention_class before insert on public.artist_source_payloads
  for each row execute function public.assign_retention_class();
create trigger raw_payloads_retention_class before insert on public.raw_payloads
  for each row execute function public.assign_retention_class();
create trigger collection_attempts_retention_class before insert on public.collection_attempts
  for each row execute function public.assign_retention_class();
create trigger artist_metric_snapshots_retention_class before insert on public.artist_metric_snapshots
  for each row execute function public.assign_metric_retention_class();

-- Append-only guard with one narrow, explicit exception ----------------------
-- Inside run_youtube_retention only (transaction-local atlas.retention=purge):
--  * a non-permanent payload may be turned into a tombstone once: only the
--    content and purge columns change, identity/checksum/fetch time stay;
--  * a youtube_statistics metric row may be deleted.
-- Everything else, including any change to permanent (Apple) rows, is refused.
create function public.guard_source_evidence() returns trigger
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
    elsif tg_op = 'DELETE' and tg_table_name = 'artist_metric_snapshots' then
      if to_jsonb(old)->>'retention_class' = 'youtube_statistics' then
        return old;
      end if;
    end if;
  end if;
  raise exception '% is append-only', tg_table_name;
end $$;

drop trigger artist_source_payloads_append_only on public.artist_source_payloads;
create trigger artist_source_payloads_append_only before update or delete on public.artist_source_payloads
  for each row execute function public.guard_source_evidence();
drop trigger raw_payloads_append_only on public.raw_payloads;
create trigger raw_payloads_append_only before update or delete on public.raw_payloads
  for each row execute function public.guard_source_evidence();
drop trigger collection_attempts_immutable on public.collection_attempts;
create trigger collection_attempts_immutable before update or delete on public.collection_attempts
  for each row execute function public.guard_source_evidence();
drop trigger artist_metric_snapshots_append_only on public.artist_metric_snapshots;
create trigger artist_metric_snapshots_append_only before update or delete on public.artist_metric_snapshots
  for each row execute function public.guard_source_evidence();

-- Mode configuration ---------------------------------------------------------

insert into public.methodology_versions (code, title, notes, effective_from)
values (
  'youtube-retention-30-day-v1',
  'YouTube retention: 30-day mode',
  'Default mode until the YouTube derived-metrics amendment is accepted (owner decision D2). Raw YouTube responses, titles, descriptions, channel names and thumbnails are removed after 30 days unless refreshed. YouTube statistics are deleted after 30 days. Apple Music and Atlas editorial records are never touched.',
  '2026-11-16'
) on conflict (code) do nothing;

create function public.youtube_retention_parameters(p_mode text) returns jsonb
language sql immutable as $$
  select case p_mode
    when '30_day' then jsonb_build_object('mode', '30_day', 'metadataDays', 30, 'statisticsDays', 30, 'statisticsMonths', null)
    when '36_month' then jsonb_build_object('mode', '36_month', 'metadataDays', 30, 'statisticsDays', null, 'statisticsMonths', 36)
  end
$$;

-- methodology_configuration is append-only, so each mode is its own row,
-- keyed by its methodology version. The newest youtube-retention row is active.
insert into public.methodology_configuration (code, parameters)
values ('youtube-retention-30-day-v1',
  public.youtube_retention_parameters('30_day') || '{"methodologyVersion":"youtube-retention-30-day-v1"}')
on conflict (code) do nothing;

create function public.youtube_retention_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select parameters from methodology_configuration
  where code like 'youtube-retention-%'
  order by created_at desc, code desc
  limit 1
$$;
grant execute on function public.youtube_retention_config() to anon, authenticated, service_role;

-- Only administrators change the mode, with a reason. Each change is a new,
-- dated methodology version plus an audit row; the previous version is closed.
create function public.set_youtube_retention_mode(p_mode text, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_code text;
  v_today date := (now() at time zone 'Asia/Ulaanbaatar')::date;
begin
  if staff_role() is distinct from 'administrator' then raise exception 'forbidden'; end if;
  if p_mode not in ('30_day', '36_month') then raise exception 'unknown retention mode'; end if;
  if coalesce(length(trim(p_reason)), 0) < 10 then raise exception 'a reason of at least 10 characters is required'; end if;
  lock table methodology_configuration in share row exclusive mode;
  v_old := youtube_retention_config();
  if v_old->>'mode' = p_mode then return v_old->>'methodologyVersion'; end if;
  v_code := 'youtube-retention-' || replace(p_mode, '_', '-') || '-' || to_char(now(), 'YYYYMMDD"T"HH24MISS');
  update methodology_versions set effective_until = v_today
    where code = v_old->>'methodologyVersion' and effective_until is null;
  insert into methodology_versions (code, title, notes, effective_from, created_by)
  values (v_code, 'YouTube retention: ' || replace(p_mode, '_', '-') || ' mode', trim(p_reason), v_today, auth.uid());
  v_new := youtube_retention_parameters(p_mode) || jsonb_build_object('methodologyVersion', v_code);
  insert into methodology_configuration (code, parameters, created_at) values (v_code, v_new, clock_timestamp());
  insert into audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, before_data, after_data, reason)
  values (auth.uid(), 'user', 'youtube_retention_mode_changed', 'methodology_configuration', v_code, v_old, v_new, trim(p_reason));
  return v_code;
end $$;
revoke all on function public.set_youtube_retention_mode(text, text) from public, anon;
grant execute on function public.set_youtube_retention_mode(text, text) to authenticated, service_role;

-- Retention runs ---------------------------------------------------------------

create table public.retention_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.pipeline_jobs(id),
  business_date date not null,
  mode text not null check (mode in ('30_day', '36_month')),
  methodology_version text not null,
  metadata_cutoff timestamptz not null,
  statistics_cutoff date not null,
  counts jsonb not null,
  started_at timestamptz not null,
  completed_at timestamptz not null default now()
);
create index retention_runs_date_idx on public.retention_runs (business_date desc);
create trigger retention_runs_append_only before update or delete on public.retention_runs
  for each row execute function public.prevent_mutation();
alter table public.retention_runs enable row level security;
create policy "staff reads retention runs" on public.retention_runs
  for select to authenticated using (public.staff_role() is not null);
grant select on public.retention_runs to authenticated;

alter table public.pipeline_jobs drop constraint pipeline_jobs_kind_check;
alter table public.pipeline_jobs add constraint pipeline_jobs_kind_check
  check (kind in ('collect', 'calculate', 'artists', 'youtube_retention'));

-- The work itself. p_now is a parameter so tests can move the clock.
create function public.apply_youtube_retention(p_now timestamptz, p_job uuid default null) returns jsonb
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
revoke all on function public.apply_youtube_retention(timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.apply_youtube_retention(timestamptz, uuid) to service_role;

create function public.enqueue_youtube_retention(p_date date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_date date := coalesce(p_date, (now() at time zone 'Asia/Ulaanbaatar')::date);
  v_job uuid;
begin
  if v_date > (now() at time zone 'Asia/Ulaanbaatar')::date then raise exception 'future retention date'; end if;
  insert into pipeline_jobs (kind, business_date, idempotency_key)
  values ('youtube_retention', v_date, 'youtube:retention:' || v_date)
  on conflict (idempotency_key) do update set idempotency_key = excluded.idempotency_key
  returning id into v_job;
  return v_job;
end $$;
revoke all on function public.enqueue_youtube_retention(date) from public, anon, authenticated;
grant execute on function public.enqueue_youtube_retention(date) to service_role;

-- Worker entry point: same lease contract as the other pipeline jobs.
create function public.run_youtube_retention(p_job uuid, p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_result jsonb;
begin
  perform 1 from pipeline_jobs where id = p_job and lease_token = p_token and lease_until > now()
    and status = 'running' and kind = 'youtube_retention' for update;
  if not found then raise exception 'lost job lease'; end if;
  v_result := apply_youtube_retention(now(), p_job);
  update pipeline_jobs set status = 'succeeded', completed_at = now(), lease_until = null where id = p_job;
  return v_result;
end $$;
revoke all on function public.run_youtube_retention(uuid, uuid) from public, anon, authenticated;
grant execute on function public.run_youtube_retention(uuid, uuid) to service_role;

comment on type public.retention_class is
  'permanent: Apple Music and Atlas facts. youtube_statistics: YouTube counts and Atlas metrics derived from them. youtube_metadata: titles, descriptions, channel names, thumbnails and raw YouTube responses.';
comment on table public.retention_runs is
  'One row per YouTube retention run: mode, cutoffs and counts. No deleted content is recorded.';
comment on function public.apply_youtube_retention(timestamptz, uuid) is
  'Tombstones expired raw YouTube payloads, deletes expired YouTube statistics and strips expired channel metadata. Never touches permanent rows. Audited per batch.';
