grant usage on schema public to anon, authenticated, service_role;

grant select on table
  public.platforms,
  public.charts,
  public.methodology_versions,
  public.artists,
  public.artist_aliases,
  public.songs,
  public.song_artists,
  public.recordings,
  public.platform_assets,
  public.chart_snapshots,
  public.chart_entries
to anon, authenticated;

grant select on table
  public.profiles,
  public.signals,
  public.signal_evidence,
  public.anomaly_alerts,
  public.anomaly_reviews,
  public.story_leads
to authenticated;

grant all privileges on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public
  grant all privileges on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to service_role;
