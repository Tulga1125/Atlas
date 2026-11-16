-- Owner, 2026-11-17:
-- 1. "As long as it's on their channel it's official; it goes for everyone":
--    youtube-metrics-v2 counts every confirmed video on the artist's own or
--    label channel towards the song, whatever its kind; elsewhere only official
--    music video, official audio and lyric video count (D4).
-- 2. "YouTube views need to show on the public artist profile; rank artists by
--    YouTube average views": decision D3 changes for these totals. Public
--    functions return each song's latest collected views (inside the active
--    YouTube retention window, never older) and a ranking by average views per
--    song. Only verified Mongolian artists are included.

insert into public.methodology_versions (code, title, notes, effective_from)
values ('youtube-metrics-v2', 'YouTube tracked metrics v2',
  'As v1, except that every confirmed video on the artist''s own or label channel counts towards the song whatever its kind; videos on other channels count only as official music video, official audio or lyric video. Public totals and the artist ranking use the latest collected view count inside the retention window; average = total views ÷ songs with counted videos.',
  '2026-11-17')
on conflict (code) do nothing;

create or replace function public.complete_youtube_calculation(p_job uuid, p_token uuid, p_through date, p_inputs jsonb,
  p_songs jsonb, p_artists jsonb, p_chart jsonb, p_engagement jsonb, p_releases jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare j pipeline_jobs; v_run uuid;
begin
  select * into j from pipeline_jobs where id = p_job and lease_token = p_token and lease_until > now() and status = 'running' and kind = 'youtube_calculate' for update;
  if not found then raise exception 'lost job lease'; end if;
  if p_through < j.business_date then p_through := j.business_date; end if;
  insert into youtube_calculation_runs (job_id, from_date, through_date, formula_version, inputs)
  values (p_job, j.business_date, p_through, 'youtube-metrics-v2', p_inputs) returning id into v_run;
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

-- Channels whose uploads are official for their artists: verified artist
-- channels and label channels recorded as artist evidence.
create function public.youtube_official_channels() returns setof text
language sql stable security definer set search_path = public as $$
  select platform_artist_id from artist_platform_profiles
  where platform_id = '00000000-0000-0000-0000-000000000002' and match_status = 'verified'
  union
  select payload->>'channelId' from artist_verification_evidence where evidence_type = 'label' and payload ? 'channelId'
$$;
revoke all on function public.youtube_official_channels() from public, anon, authenticated;

-- First business date inside the active YouTube statistics window.
create function public.youtube_window_start() returns date
language sql stable security definer set search_path = public as $$
  select case when (c->>'statisticsMonths') is not null
              then ((now() at time zone 'Asia/Ulaanbaatar')::date - make_interval(months => (c->>'statisticsMonths')::integer))::date
              else (now() at time zone 'Asia/Ulaanbaatar')::date - (c->>'statisticsDays')::integer end
  from (select youtube_retention_config() c) x
$$;
revoke all on function public.youtube_window_start() from public, anon, authenticated;

-- Latest counted views per song (primary credits), inside the window.
create function public.youtube_song_view_totals() returns table (song_id uuid, artist_id uuid, views bigint, videos integer, as_of date)
language sql stable security definer set search_path = public as $$
  with latest as (
    select distinct on (s.platform_asset_id) s.platform_asset_id, s.view_count, s.business_date
    from youtube_video_statistics s
    where s.status = 'approved' and s.view_count is not null and s.business_date >= youtube_window_start()
    order by s.platform_asset_id, s.business_date desc
  ), counted as (
    select y.platform_asset_id, r.song_id
    from youtube_video_assets y
    join platform_assets pa on pa.id = y.platform_asset_id
    join recordings r on r.id = pa.recording_id
    where y.link_status = 'linked' and y.verification = 'verified'
      and (y.link_method = 'source_import' or y.channel_id in (select youtube_official_channels())
           or y.asset_kind in ('official_music_video', 'official_audio', 'lyric_video'))
  )
  select c.song_id, sa.artist_id, sum(l.view_count)::bigint, count(*)::integer, max(l.business_date)
  from counted c
  join latest l using (platform_asset_id)
  join songs so on so.id = c.song_id and so.redirect_to is null
  join song_artists sa on sa.song_id = c.song_id and sa.credit_role = 'primary'
  join artists a on a.id = sa.artist_id and a.redirect_to is null and a.verification = 'verified' and a.locality = 'local'
  group by c.song_id, sa.artist_id
$$;
revoke all on function public.youtube_song_view_totals() from public, anon, authenticated;

create function public.public_youtube_song_totals(p_artist uuid)
returns table (song_id uuid, title text, views bigint, videos integer, as_of date)
language sql stable security definer set search_path = public as $$
  select t.song_id, s.canonical_title, t.views, t.videos, t.as_of
  from youtube_song_view_totals() t join songs s on s.id = t.song_id
  where t.artist_id = p_artist
  order by t.views desc, s.canonical_title
$$;
revoke all on function public.public_youtube_song_totals(uuid) from public;
grant execute on function public.public_youtube_song_totals(uuid) to anon, authenticated, service_role;

create function public.public_youtube_artist_ranking()
returns table (rank integer, artist_id uuid, name text, songs integer, total_views bigint, average_views bigint, as_of date)
language sql stable security definer set search_path = public as $$
  select (row_number() over (order by sum(t.views) / count(*) desc, a.canonical_name))::integer,
         a.id, a.canonical_name, count(*)::integer, sum(t.views)::bigint, (sum(t.views) / count(*))::bigint, max(t.as_of)
  from youtube_song_view_totals() t join artists a on a.id = t.artist_id
  group by a.id, a.canonical_name
  order by 1
$$;
revoke all on function public.public_youtube_artist_ranking() from public;
grant execute on function public.public_youtube_artist_ranking() to anon, authenticated, service_role;
