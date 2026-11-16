create extension if not exists pgcrypto with schema extensions;

create type public.user_role as enum ('administrator', 'data_editor', 'editor', 'writer', 'analyst');
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'partial', 'rejected', 'cancelled');
create type public.snapshot_status as enum ('candidate', 'approved', 'rejected', 'replaced');
create type public.entry_status as enum ('new', 're_entry', 'up', 'down', 'unchanged');
create type public.severity as enum ('low', 'medium', 'high', 'critical');
create type public.signal_status as enum ('new', 'under_review', 'confirmed', 'dismissed', 'converted_to_lead');
create type public.anomaly_status as enum ('open', 'reviewing', 'confirmed_event', 'data_error', 'dismissed', 'resolved');
create type public.story_status as enum ('detected', 'needs_verification', 'verified', 'assigned', 'drafting', 'editing', 'approved', 'published', 'archived', 'dismissed');
create type public.verification_status as enum ('unverified', 'suggested', 'verified', 'disputed');
create type public.locality as enum ('local', 'international', 'mixed', 'unknown');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role public.user_role not null default 'analyst',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platforms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive', 'degraded')),
  base_region text,
  created_at timestamptz not null default now()
);

create table public.charts (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.platforms(id),
  slug text not null unique,
  name text not null,
  country_code text not null check (char_length(country_code) = 2),
  chart_type text not null default 'songs',
  frequency text not null default 'daily' check (frequency in ('hourly', 'daily', 'weekly', 'monthly', 'yearly')),
  maximum_entries integer not null check (maximum_entries > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.methodology_versions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  notes text not null,
  effective_from date not null,
  effective_until date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (effective_until is null or effective_until >= effective_from)
);

create table public.collection_jobs (
  id uuid primary key default gen_random_uuid(),
  chart_id uuid not null references public.charts(id),
  idempotency_key text not null unique,
  scheduled_for timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  status public.job_status not null default 'queued',
  attempt_number integer not null default 1 check (attempt_number > 0),
  items_received integer,
  error_code text,
  error_message text,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.raw_payloads (
  id uuid primary key default gen_random_uuid(),
  collection_job_id uuid not null references public.collection_jobs(id),
  source_url text not null,
  source_timestamp timestamptz,
  checksum text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (collection_job_id, checksum)
);

create table public.artists (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  sort_name text not null,
  source_key text unique,
  country_code text,
  locality public.locality not null default 'unknown',
  artist_type text not null default 'project' check (artist_type in ('person', 'group', 'band', 'project')),
  verification public.verification_status not null default 'suggested',
  image_url text,
  biography text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.artist_aliases (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  language text,
  platform_id uuid references public.platforms(id),
  created_at timestamptz not null default now(),
  unique (artist_id, normalized_alias, platform_id)
);

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  canonical_title text not null,
  normalized_title text not null,
  source_key text unique,
  primary_artist_id uuid references public.artists(id),
  release_date date,
  language text,
  genre text,
  explicit boolean,
  locality public.locality not null default 'unknown',
  verification public.verification_status not null default 'suggested',
  artwork_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.song_artists (
  song_id uuid not null references public.songs(id) on delete cascade,
  artist_id uuid not null references public.artists(id),
  credit_role text not null default 'primary',
  credit_order integer not null default 0,
  primary key (song_id, artist_id, credit_role)
);

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id),
  version_name text,
  isrc text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  release_date date,
  recording_type text not null default 'original',
  created_at timestamptz not null default now()
);

create index recordings_isrc_idx on public.recordings(isrc) where isrc is not null;

create table public.platform_assets (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.platforms(id),
  recording_id uuid references public.recordings(id),
  platform_item_id text not null,
  platform_url text,
  platform_artist_id text,
  platform_artist_name text not null,
  platform_title text not null,
  platform_album text,
  artwork_url text,
  duration_ms integer,
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw_metadata jsonb not null default '{}'::jsonb,
  unique (platform_id, platform_item_id)
);

create table public.entity_match_reviews (
  id uuid primary key default gen_random_uuid(),
  platform_asset_id uuid not null references public.platform_assets(id),
  suggested_recording_id uuid references public.recordings(id),
  confidence numeric(4,3) check (confidence between 0 and 1),
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'linked', 'new_entity', 'dismissed')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.chart_snapshots (
  id uuid primary key default gen_random_uuid(),
  chart_id uuid not null references public.charts(id),
  collection_job_id uuid not null references public.collection_jobs(id),
  raw_payload_id uuid not null references public.raw_payloads(id),
  methodology_version_id uuid references public.methodology_versions(id),
  snapshot_date date not null,
  collected_at timestamptz not null,
  source_timestamp timestamptz,
  entry_count integer not null,
  status public.snapshot_status not null default 'candidate',
  checksum text not null,
  is_complete boolean not null default false,
  revision_of uuid references public.chart_snapshots(id),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create unique index chart_snapshots_one_approved_per_day
  on public.chart_snapshots(chart_id, snapshot_date)
  where status = 'approved';

create index chart_snapshots_chart_date_idx on public.chart_snapshots(chart_id, snapshot_date desc);

create table public.chart_entries (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.chart_snapshots(id) on delete restrict,
  platform_asset_id uuid not null references public.platform_assets(id),
  song_id uuid not null references public.songs(id),
  rank integer not null check (rank > 0),
  previous_rank integer check (previous_rank is null or previous_rank > 0),
  rank_change integer,
  entry_status public.entry_status not null,
  peak_rank integer not null check (peak_rank > 0),
  days_on_chart integer not null check (days_on_chart > 0),
  momentum_score numeric(5,2) check (momentum_score between 0 and 100),
  raw_metadata jsonb not null default '{}'::jsonb,
  unique (snapshot_id, rank),
  unique (snapshot_id, platform_asset_id)
);

create index chart_entries_song_snapshot_idx on public.chart_entries(song_id, snapshot_id);

create table public.calculation_runs (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.chart_snapshots(id),
  calculation_version text not null,
  status public.job_status not null default 'queued',
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (snapshot_id, calculation_version)
);

create table public.signals (
  id uuid primary key default gen_random_uuid(),
  signal_type text not null,
  song_id uuid references public.songs(id),
  artist_id uuid references public.artists(id),
  chart_id uuid not null references public.charts(id),
  snapshot_id uuid not null references public.chart_snapshots(id),
  detected_at timestamptz not null default now(),
  severity public.severity not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  headline_summary text not null,
  status public.signal_status not null default 'new',
  rule_version text not null
);

create index signals_status_detected_idx on public.signals(status, detected_at desc, severity);

create table public.signal_evidence (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null references public.signals(id) on delete cascade,
  chart_entry_id uuid references public.chart_entries(id),
  evidence_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table public.anomaly_alerts (
  id uuid primary key default gen_random_uuid(),
  chart_id uuid not null references public.charts(id),
  snapshot_id uuid references public.chart_snapshots(id),
  platform_asset_id uuid references public.platform_assets(id),
  anomaly_type text not null,
  severity public.severity not null,
  summary text not null,
  expected_value jsonb,
  observed_value jsonb,
  evidence jsonb not null default '{}'::jsonb,
  status public.anomaly_status not null default 'open',
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.anomaly_reviews (
  id uuid primary key default gen_random_uuid(),
  anomaly_id uuid not null references public.anomaly_alerts(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  resolution public.anomaly_status not null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.story_leads (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid references public.signals(id),
  headline text not null,
  angle text not null,
  supporting_facts jsonb not null default '[]'::jsonb,
  historical_context text,
  priority text not null default 'normal' check (priority in ('urgent', 'high', 'normal', 'low')),
  confidence numeric(4,3) check (confidence between 0 and 1),
  format text,
  status public.story_status not null default 'needs_verification',
  assigned_to uuid references public.profiles(id),
  editor_id uuid references public.profiles(id),
  deadline timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.profiles(id),
  actor_type text not null default 'system',
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_data jsonb,
  after_data jsonb,
  reason text,
  correlation_id uuid,
  created_at timestamptz not null default now()
);

create function public.prevent_mutation() returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

create trigger raw_payloads_append_only
before update or delete on public.raw_payloads
for each row execute function public.prevent_mutation();

create trigger audit_logs_append_only
before update or delete on public.audit_logs
for each row execute function public.prevent_mutation();

create function public.prevent_approved_entry_mutation() returns trigger
language plpgsql
as $$
declare
  target_snapshot_id uuid := coalesce(old.snapshot_id, new.snapshot_id);
begin
  if exists (
    select 1 from public.chart_snapshots
    where id = target_snapshot_id and status = 'approved'
  ) then
    raise exception 'entries belonging to an approved snapshot are immutable';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger chart_entries_approved_immutable
before update or delete on public.chart_entries
for each row execute function public.prevent_approved_entry_mutation();

create function public.handle_new_user() returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.platforms enable row level security;
alter table public.charts enable row level security;
alter table public.methodology_versions enable row level security;
alter table public.collection_jobs enable row level security;
alter table public.raw_payloads enable row level security;
alter table public.artists enable row level security;
alter table public.artist_aliases enable row level security;
alter table public.songs enable row level security;
alter table public.song_artists enable row level security;
alter table public.recordings enable row level security;
alter table public.platform_assets enable row level security;
alter table public.entity_match_reviews enable row level security;
alter table public.chart_snapshots enable row level security;
alter table public.chart_entries enable row level security;
alter table public.calculation_runs enable row level security;
alter table public.signals enable row level security;
alter table public.signal_evidence enable row level security;
alter table public.anomaly_alerts enable row level security;
alter table public.anomaly_reviews enable row level security;
alter table public.story_leads enable row level security;
alter table public.audit_logs enable row level security;

create policy "public reads active platforms" on public.platforms for select using (status = 'active');
create policy "public reads active charts" on public.charts for select using (active);
create policy "public reads methodology" on public.methodology_versions for select using (effective_from <= current_date);
create policy "public reads artists" on public.artists for select using (true);
create policy "public reads artist aliases" on public.artist_aliases for select using (true);
create policy "public reads songs" on public.songs for select using (true);
create policy "public reads song credits" on public.song_artists for select using (true);
create policy "public reads recordings" on public.recordings for select using (true);
create policy "public reads platform assets" on public.platform_assets for select using (true);
create policy "public reads approved snapshots" on public.chart_snapshots
  for select using (status = 'approved');
create policy "public reads approved chart entries" on public.chart_entries
  for select using (
    exists (
      select 1 from public.chart_snapshots s
      where s.id = chart_entries.snapshot_id and s.status = 'approved'
    )
  );

create policy "users read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy "staff reads signals" on public.signals
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active)
  );
create policy "staff reads signal evidence" on public.signal_evidence
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active)
  );
create policy "staff reads anomalies" on public.anomaly_alerts
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active)
  );
create policy "staff reads story leads" on public.story_leads
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active)
  );

comment on table public.chart_snapshots is 'Immutable once approved. Corrections create a new revision row.';
comment on table public.raw_payloads is 'Untouched source evidence stored in Postgres so database backups include it.';
comment on column public.chart_entries.rank_change is 'previous_rank - rank; positive values indicate upward movement.';
