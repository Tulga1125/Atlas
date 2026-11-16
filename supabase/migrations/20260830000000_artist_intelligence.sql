insert into public.platforms (id, code, name, base_region)
values
  ('00000000-0000-0000-0000-000000000002', 'youtube', 'YouTube', 'MN'),
  ('00000000-0000-0000-0000-000000000003', 'spotify', 'Spotify', 'MN'),
  ('00000000-0000-0000-0000-000000000004', 'musicbrainz', 'MusicBrainz', null),
  ('00000000-0000-0000-0000-000000000005', 'wikidata', 'Wikidata', null),
  ('00000000-0000-0000-0000-000000000006', 'atlas', 'Atlas Charts', 'MN')
on conflict (code) do update
set name = excluded.name,
    base_region = excluded.base_region;

create table public.artist_platform_profiles (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  platform_id uuid not null references public.platforms(id),
  platform_artist_id text not null,
  profile_url text,
  is_primary boolean not null default true,
  match_status public.verification_status not null default 'suggested',
  match_method text not null check (match_method in ('source', 'isrc', 'url', 'manual', 'artist_claim')),
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  metadata jsonb not null default '{}'::jsonb,
  last_enriched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, platform_artist_id)
);

create unique index artist_platform_profiles_one_primary_idx
  on public.artist_platform_profiles (artist_id, platform_id)
  where is_primary;

create index artist_platform_profiles_artist_idx
  on public.artist_platform_profiles (artist_id, match_status);

create table public.artist_verification_evidence (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  evidence_type text not null check (
    evidence_type in ('official_profile', 'musicbrainz', 'wikidata', 'label', 'press', 'artist_claim', 'manual')
  ),
  source_url text,
  payload jsonb not null default '{}'::jsonb,
  supports_locality public.locality,
  supports_country_code text check (
    supports_country_code is null or char_length(supports_country_code) = 2
  ),
  notes text,
  reviewed_by uuid references public.profiles(id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index artist_verification_evidence_artist_idx
  on public.artist_verification_evidence (artist_id, created_at desc);

create table public.artist_intelligence_runs (
  id uuid primary key default gen_random_uuid(),
  source_platform_id uuid not null references public.platforms(id),
  idempotency_key text not null unique,
  scheduled_for timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  status public.job_status not null default 'queued',
  attempt_number integer not null default 1 check (attempt_number > 0),
  artists_requested integer not null default 0 check (artists_requested >= 0),
  profiles_updated integer not null default 0 check (profiles_updated >= 0),
  metrics_written integer not null default 0 check (metrics_written >= 0),
  error_message text,
  created_at timestamptz not null default now()
);

create index artist_intelligence_runs_platform_date_idx
  on public.artist_intelligence_runs (source_platform_id, scheduled_for desc);

create table public.artist_source_payloads (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.artist_intelligence_runs(id),
  profile_id uuid references public.artist_platform_profiles(id),
  source_url text not null,
  source_timestamp timestamptz,
  checksum text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (run_id, checksum)
);

create table public.artist_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  platform_id uuid not null references public.platforms(id),
  profile_id uuid not null references public.artist_platform_profiles(id),
  raw_payload_id uuid not null references public.artist_source_payloads(id),
  metric_date date not null,
  collected_at timestamptz not null default now(),
  source_timestamp timestamptz,
  metric_name text not null check (
    metric_name in ('subscribers', 'total_views', 'video_count')
  ),
  metric_value numeric not null check (metric_value >= 0),
  unit text not null check (unit in ('people', 'views', 'videos')),
  scope text not null default 'global',
  dimensions jsonb not null default '{}'::jsonb,
  methodology_version text not null,
  unique (artist_id, platform_id, metric_date, metric_name, scope)
);

create index artist_metric_snapshots_artist_date_idx
  on public.artist_metric_snapshots (artist_id, metric_date desc, metric_name);

create trigger artist_source_payloads_append_only
before update or delete on public.artist_source_payloads
for each row execute function public.prevent_mutation();

create trigger artist_metric_snapshots_append_only
before update or delete on public.artist_metric_snapshots
for each row execute function public.prevent_mutation();

create view public.artist_chart_daily_stats
with (security_invoker = true)
as
with artist_credits as (
  select distinct song_id, artist_id
  from public.song_artists
)
select
  ac.artist_id,
  cs.chart_id,
  cs.snapshot_date,
  count(*)::integer as charting_songs,
  min(ce.rank)::integer as best_rank,
  count(*) filter (where ce.rank <= 10)::integer as top_ten_songs,
  count(*) filter (where ce.rank = 1)::integer as number_one_songs,
  count(*) filter (where ce.entry_status = 'new')::integer as new_entries,
  coalesce(sum(ce.rank_change), 0)::integer as net_rank_change
from public.chart_entries ce
join public.chart_snapshots cs on cs.id = ce.snapshot_id
join artist_credits ac on ac.song_id = ce.song_id
join public.artists a on a.id = ac.artist_id
where cs.status = 'approved'
  and a.locality = 'local'
  and a.verification = 'verified'
group by ac.artist_id, cs.chart_id, cs.snapshot_date;

create view public.artist_chart_career_stats
with (security_invoker = true)
as
with artist_credits as (
  select distinct song_id, artist_id
  from public.song_artists
)
select
  ac.artist_id,
  cs.chart_id,
  min(cs.snapshot_date) as first_chart_date,
  max(cs.snapshot_date) as latest_chart_date,
  count(distinct cs.snapshot_date)::integer as charting_days,
  count(distinct ce.song_id)::integer as songs_charted,
  min(ce.rank)::integer as peak_rank,
  count(*) filter (where ce.rank <= 10)::integer as top_ten_entry_days,
  count(*) filter (where ce.rank = 1)::integer as number_one_entry_days,
  count(*)::integer as total_entry_days
from public.chart_entries ce
join public.chart_snapshots cs on cs.id = ce.snapshot_id
join artist_credits ac on ac.song_id = ce.song_id
join public.artists a on a.id = ac.artist_id
where cs.status = 'approved'
  and a.locality = 'local'
  and a.verification = 'verified'
group by ac.artist_id, cs.chart_id;

create view public.artist_latest_metrics
with (security_invoker = true)
as
select distinct on (ams.artist_id, ams.platform_id, ams.metric_name, ams.scope)
  ams.artist_id,
  ams.platform_id,
  p.code as platform_code,
  p.name as platform_name,
  ams.metric_date,
  ams.collected_at,
  ams.metric_name,
  ams.metric_value,
  ams.unit,
  ams.scope,
  ams.methodology_version
from public.artist_metric_snapshots ams
join public.platforms p on p.id = ams.platform_id
order by
  ams.artist_id,
  ams.platform_id,
  ams.metric_name,
  ams.scope,
  ams.metric_date desc,
  ams.collected_at desc;

comment on table public.artist_platform_profiles is
  'Verified platform identifiers for canonical artists. Name-only matches must remain suggested.';
comment on table public.artist_source_payloads is
  'Immutable source evidence retained for every artist enrichment batch.';
comment on table public.artist_metric_snapshots is
  'Immutable daily public metrics from verified artist profiles; values are never inferred.';
comment on view public.artist_chart_career_stats is
  'Atlas-owned statistics derived only from approved chart snapshots for verified local artists.';

alter table public.artist_platform_profiles enable row level security;
alter table public.artist_verification_evidence enable row level security;
alter table public.artist_intelligence_runs enable row level security;
alter table public.artist_source_payloads enable row level security;
alter table public.artist_metric_snapshots enable row level security;

create policy "public reads verified artist profiles"
on public.artist_platform_profiles
for select to anon, authenticated
using (
  match_status = 'verified'
  and exists (
    select 1 from public.artists a
    where a.id = artist_platform_profiles.artist_id
      and a.locality = 'local'
      and a.verification = 'verified'
  )
);

create policy "public reads verified artist metrics"
on public.artist_metric_snapshots
for select to anon, authenticated
using (
  exists (
    select 1
    from public.artist_platform_profiles app
    join public.artists a on a.id = app.artist_id
    where app.id = artist_metric_snapshots.profile_id
      and app.match_status = 'verified'
      and a.locality = 'local'
      and a.verification = 'verified'
  )
);

create policy "staff reads all artist profiles"
on public.artist_platform_profiles
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active
  )
);

create policy "staff reads artist evidence"
on public.artist_verification_evidence
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active
  )
);

create policy "staff reads artist intelligence runs"
on public.artist_intelligence_runs
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active
  )
);

create policy "staff reads artist source payloads"
on public.artist_source_payloads
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active
  )
);

create policy "staff reads all artist metrics"
on public.artist_metric_snapshots
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active
  )
);

revoke all privileges on table
  public.artist_platform_profiles,
  public.artist_verification_evidence,
  public.artist_intelligence_runs,
  public.artist_source_payloads,
  public.artist_metric_snapshots,
  public.artist_chart_daily_stats,
  public.artist_chart_career_stats,
  public.artist_latest_metrics
from anon, authenticated;

grant select on table
  public.artist_platform_profiles,
  public.artist_metric_snapshots,
  public.artist_chart_daily_stats,
  public.artist_chart_career_stats,
  public.artist_latest_metrics
to anon, authenticated;

grant select on table
  public.artist_verification_evidence,
  public.artist_intelligence_runs,
  public.artist_source_payloads
to authenticated;
