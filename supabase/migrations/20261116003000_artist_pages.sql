-- C2: artist and song pages. Published Atlas articles about an artist or song.
-- Publications are public; the story leads and signals that connect them to a
-- subject are staff-only, so this definer function exposes only the link.

create function public.subject_publications(p_artist uuid default null, p_song uuid default null)
returns table (id uuid, headline_mn text, headline_en text, published_at timestamptz, channel text, external_url text)
language sql stable security definer set search_path = public as $$
  select distinct p.id, p.headline_mn, p.headline_en, p.published_at, p.channel, p.external_url
  from publications p
  join story_leads l on l.id = p.story_id
  join signals s on s.id = l.signal_id
  where (p_artist is not null and (s.artist_id = p_artist
           or s.song_id in (select song_id from song_artists where artist_id = p_artist)))
     or (p_song is not null and s.song_id = p_song)
  order by p.published_at desc, p.id desc
  limit 50
$$;
revoke all on function public.subject_publications(uuid, uuid) from public;
grant execute on function public.subject_publications(uuid, uuid) to anon, authenticated, service_role;
comment on function public.subject_publications(uuid, uuid) is
  'Published articles about an artist (directly or through a credited song) or a song. Returns only public publication fields.';
