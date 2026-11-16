-- 1. Atlas Mongolia Top 50 (weekly): the formula as a versioned methodology.
--    The chart is computed from stored evidence on request (never stored), so
--    it can only cover weeks inside the YouTube retention window.
-- 2. Artist approval queue: when a new name appears on the Apple chart, Atlas
--    proposes what to do (merge into a known Mongolian artist, add a new artist
--    with a likely YouTube channel, or mark international) with its evidence.
--    A person approves with one click; nothing changes until then.

insert into public.methodology_versions (code, title, notes, effective_from)
values ('atlas-mn-weekly-v1', 'Atlas Mongolia Top 50 v1',
  'Weekly (Monday to Sunday, Ulaanbaatar), Mongolian artists only. Score = 0.6 × Apple score + 0.4 × YouTube score. Apple score: sum over the week of (101 − Apple Music Mongolia rank) ÷ (100 × charts collected that week). YouTube score: the song''s views gained that week on official videos (worldwide) ÷ the most gained by any Mongolian song that week. Ties: Apple score, then views, then song ID. Final once the week is over with at least 5 Apple charts and 5 YouTube days.',
  '2026-11-17')
on conflict (code) do nothing;
insert into public.methodology_configuration (code, parameters)
values ('atlas-mn-weekly-v1', '{"size": 50, "appleWeight": 0.6, "youtubeWeight": 0.4, "minAppleDays": 5, "minYouTubeDays": 5}')
on conflict (code) do nothing;
insert into public.methodology_configuration (code, parameters)
values ('artist-queue-v1', '{"channelSearchesPerRun": 8, "minSubscribers": 1000}')
on conflict (code) do nothing;

create table public.artist_proposals (
  id uuid primary key default gen_random_uuid(),
  apple_artist_id uuid not null references public.artists(id),
  proposal text not null check (proposal in ('merge', 'new_with_channel', 'international', 'review')),
  target_artist_id uuid references public.artists(id),
  channel_id text check (channel_id is null or channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
  co_artist_ids uuid[] not null default '{}',
  evidence jsonb not null,
  rule_version text not null default 'artist-queue-v1',
  status text not null default 'open' check (status in ('open', 'approved', 'rejected', 'superseded')),
  decision text check (decision in ('merge', 'new_with_channel', 'international', 'reject')),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  check (proposal <> 'merge' or target_artist_id is not null),
  check (proposal <> 'new_with_channel' or channel_id is not null)
);
create unique index artist_proposals_one_open_idx on public.artist_proposals (apple_artist_id) where status = 'open';
alter table public.artist_proposals enable row level security;
create policy "staff reads artist proposals" on public.artist_proposals for select to authenticated using (public.staff_role() is not null);
grant select on public.artist_proposals to authenticated;

-- The generator (service role) records one open proposal per Apple artist.
create function public.record_artist_proposal(p_apple_artist uuid, p_proposal text, p_target uuid, p_channel text, p_co_artists uuid[], p_evidence jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if exists (select 1 from artist_proposals where apple_artist_id = p_apple_artist and status = 'open') then return null; end if;
  if exists (select 1 from artist_proposals where apple_artist_id = p_apple_artist and status = 'rejected'
             and evidence = p_evidence) then return null; end if;
  insert into artist_proposals (apple_artist_id, proposal, target_artist_id, channel_id, co_artist_ids, evidence)
  values (p_apple_artist, p_proposal, p_target, p_channel, coalesce(p_co_artists, '{}'), p_evidence)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.record_artist_proposal(uuid, text, uuid, text, uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.record_artist_proposal(uuid, text, uuid, text, uuid[], jsonb) to service_role;

-- Records the decision once the dashboard has carried it out.
create function public.decide_artist_proposal(p_id uuid, p_decision text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v artist_proposals;
begin
  if staff_role() is null or staff_role() not in ('administrator', 'data_editor') then raise exception 'forbidden'; end if;
  if p_decision not in ('merge', 'new_with_channel', 'international', 'reject') then raise exception 'invalid decision'; end if;
  select * into v from artist_proposals where id = p_id for update;
  if v.id is null or v.status <> 'open' then raise exception 'proposal is not open'; end if;
  update artist_proposals set status = case when p_decision = 'reject' then 'rejected' else 'approved' end,
    decision = p_decision, decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '')
  where id = p_id;
  insert into audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, before_data, after_data, reason)
  values (auth.uid(), 'user', 'artist_proposal.' || p_decision, 'artist', v.apple_artist_id::text, to_jsonb(v),
          jsonb_build_object('decision', p_decision), coalesce(nullif(trim(p_note), ''), 'Decided in the artist approval queue'));
end $$;
revoke all on function public.decide_artist_proposal(uuid, text, text) from public, anon;
grant execute on function public.decide_artist_proposal(uuid, text, text) to authenticated;

-- Editors add a co-credit when a joint Apple credit ("A & B") is merged into A.
create function public.add_song_credit(p_song uuid, p_artist uuid, p_role text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if staff_role() is null or staff_role() not in ('administrator', 'data_editor') then raise exception 'forbidden'; end if;
  if p_role not in ('primary', 'featured') then raise exception 'invalid credit'; end if;
  if coalesce(length(trim(p_reason)), 0) not between 10 and 2000 then raise exception 'a reason of at least 10 characters is required'; end if;
  if exists (select 1 from artists where id = p_artist and redirect_to is not null) then raise exception 'use the merged target artist'; end if;
  insert into song_artists (song_id, artist_id, credit_role, credit_order)
  values (p_song, p_artist, p_role, (select coalesce(max(credit_order), 0) + 1 from song_artists where song_id = p_song))
  on conflict do nothing;
  insert into audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, after_data, reason)
  values (auth.uid(), 'user', 'song.credit_added', 'song', p_song::text, jsonb_build_object('artist', p_artist, 'role', p_role), trim(p_reason));
end $$;
revoke all on function public.add_song_credit(uuid, uuid, text, text) from public, anon;
grant execute on function public.add_song_credit(uuid, uuid, text, text) to authenticated;
