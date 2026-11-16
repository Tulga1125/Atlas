create index recordings_song_idx on public.recordings(song_id);
create index assets_recording_idx on public.platform_assets(recording_id);
create index publications_date_idx on public.publications(published_at desc,id);
create function public.search_catalog(p_query text,p_after uuid default null) returns table(id uuid,title text,kind text)
language sql stable security invoker set search_path=public as $$
  select * from (
    select s.id,s.canonical_title as title,'song'::text as kind from songs s
    where s.redirect_to is null and (normalize_catalog_text(s.canonical_title) like '%'||normalize_catalog_text(p_query)||'%'
      or exists(select 1 from song_aliases a where a.song_id=s.id and normalize_catalog_text(a.alias) like '%'||normalize_catalog_text(p_query)||'%'))
    union all
    select a.id,a.canonical_name,'artist'::text from artists a where a.verification='verified' and a.locality='local' and
      (normalize_catalog_text(a.canonical_name) like '%'||normalize_catalog_text(p_query)||'%' or exists(select 1 from artist_aliases aa where aa.artist_id=a.id and normalize_catalog_text(aa.alias) like '%'||normalize_catalog_text(p_query)||'%'))
  ) found where length(trim(p_query)) between 2 and 80 and (p_after is null or found.id>p_after) order by id limit 51;
$$;
revoke all on function public.search_catalog(text,uuid) from public;
grant execute on function public.search_catalog(text,uuid) to anon,authenticated,service_role;

create function public.create_catalog_song(p_title text,p_artist uuid,p_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare s uuid;
begin
  if staff_role() is null or staff_role() not in ('administrator','data_editor') then raise exception 'forbidden'; end if;
  if length(trim(coalesce(p_title,''))) not between 1 and 240 or length(trim(coalesce(p_reason,''))) not between 10 and 2000 then raise exception 'title and reason required'; end if;
  if not exists(select 1 from artists where id=p_artist) then raise exception 'artist not found'; end if;
  insert into songs(canonical_title,normalized_title,primary_artist_id) values(trim(p_title),normalize_catalog_text(p_title),p_artist) returning id into s;
  insert into song_artists(song_id,artist_id) values(s,p_artist);
  insert into audit_logs(actor_user_id,actor_type,action,entity_type,entity_id,reason) values(auth.uid(),'user','song.created','song',s::text,p_reason);
  return s;
end $$;
revoke all on function public.create_catalog_song(text,uuid,text) from public,anon;
grant execute on function public.create_catalog_song(text,uuid,text) to authenticated;

-- Notify an independent monitor by reading this authenticated endpoint; never expose credentials.
create table public.auth_rate_limits (key text primary key,window_start timestamptz not null,requests integer not null);
alter table public.auth_rate_limits enable row level security;
create function public.consume_auth_limit(p_key text) returns boolean language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  insert into auth_rate_limits(key,window_start,requests) values(p_key,date_trunc('hour',now()),1)
  on conflict(key) do update set requests=case when auth_rate_limits.window_start<date_trunc('hour',now()) then 1 else auth_rate_limits.requests+1 end,window_start=date_trunc('hour',now()) returning requests into n;
  delete from auth_rate_limits where window_start<now()-interval '2 days';
  return n<=5;
end $$;
revoke all on function public.consume_auth_limit(text) from public,anon,authenticated;
grant execute on function public.consume_auth_limit(text) to service_role;
