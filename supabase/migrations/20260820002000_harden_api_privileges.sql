revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;

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
  public.collection_jobs,
  public.entity_match_reviews,
  public.calculation_runs,
  public.signals,
  public.signal_evidence,
  public.anomaly_alerts,
  public.anomaly_reviews,
  public.story_leads
to authenticated;

alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated;
