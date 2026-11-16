-- C1: music-context taxonomy and tagging.
--
-- Four separate dimensions, never mixed in one field: genre (song), theme
-- (song), mood (song, optional) and scene (artist). Controlled vocabulary
-- (owner decision D7) with versioned, audited changes; editors propose terms,
-- administrators approve them. Tags are suggestions until verified; only
-- verified tags are public. Rejected tags stay as 'unverified' (never deleted).
-- Never lyrics: evidence is a URL or a short note in the editor's own words.
-- Tags describe music, never artists' personal or protected traits.

create table public.context_dimensions (
  code text primary key check (code in ('genre', 'theme', 'scene', 'mood')),
  level text not null check (level in ('song', 'artist')),
  label_mn text not null,
  label_en text not null,
  sort_order integer not null
);
insert into public.context_dimensions values
  ('genre', 'song', 'Төрөл', 'Genre', 1),
  ('theme', 'song', 'Сэдэв', 'Theme', 2),
  ('mood', 'song', 'Сэтгэгдэл', 'Mood', 3),
  ('scene', 'artist', 'Орчин', 'Scene', 4);

create table public.context_terms (
  id uuid primary key default gen_random_uuid(),
  dimension text not null references public.context_dimensions(code),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label_mn text not null check (length(trim(label_mn)) between 1 and 120),
  label_en text not null check (length(trim(label_en)) between 1 and 120),
  description_mn text,
  description_en text,
  parent_id uuid references public.context_terms(id),
  status text not null default 'active' check (status in ('proposed', 'active', 'retired')),
  sort_order integer not null default 1000,
  proposed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dimension, slug)
);

insert into public.context_terms (dimension, slug, label_mn, label_en, sort_order) values
  ('genre', 'pop', 'Поп', 'Pop', 0),
  ('genre', 'hip-hop', 'Хип хоп', 'Hip-hop / Rap', 1),
  ('genre', 'rnb-soul', 'Ар энд би / Соул', 'R&B / Soul', 2),
  ('genre', 'rock', 'Рок', 'Rock', 3),
  ('genre', 'metal', 'Метал', 'Metal', 4),
  ('genre', 'hunnu-rock', 'Хүннү рок / фолк метал', 'Hunnu rock / Folk metal', 5),
  ('genre', 'indie-alternative', 'Инди / Альтернатив', 'Indie / Alternative', 6),
  ('genre', 'electronic', 'Электрон', 'Electronic / Dance', 7),
  ('genre', 'ballad', 'Баллад', 'Ballad', 8),
  ('genre', 'folk-fusion', 'Ардын хөгжмийн фьюжн', 'Folk fusion', 9),
  ('genre', 'mongolian-folk', 'Ардын дуу', 'Mongolian folk song', 10),
  ('genre', 'traditional', 'Уламжлалт хөгжим (хөөмий, морин хуур, уртын дуу)', 'Traditional (khöömii, morin khuur, long song)', 11),
  ('genre', 'jazz', 'Жазз', 'Jazz', 12),
  ('genre', 'classical', 'Сонгодог', 'Classical', 13),
  ('genre', 'other', 'Бусад', 'Other', 14),
  ('theme', 'love', 'Хайр дурлал', 'Love', 15),
  ('theme', 'heartbreak', 'Салалт, шаналал', 'Heartbreak', 16),
  ('theme', 'homeland', 'Эх орон', 'Homeland / Patriotism', 17),
  ('theme', 'nature-steppe', 'Байгаль, тал нутаг', 'Nature and the steppe', 18),
  ('theme', 'parents-family', 'Эцэг эх, гэр бүл', 'Parents and family', 19),
  ('theme', 'friendship', 'Нөхөрлөл', 'Friendship', 20),
  ('theme', 'party-nightlife', 'Үдэшлэг, зугаа цэнгэл', 'Party and nightlife', 21),
  ('theme', 'ambition-hustle', 'Тэмүүлэл, амжилт', 'Ambition and hustle', 22),
  ('theme', 'self-empowerment', 'Өөртөө итгэх', 'Self-empowerment', 23),
  ('theme', 'city-life', 'Хотын амьдрал', 'City life / Ulaanbaatar', 24),
  ('theme', 'social-commentary', 'Нийгмийн шүүмж', 'Social commentary', 25),
  ('theme', 'spiritual', 'Оюун санаа, сүсэг', 'Spiritual', 26),
  ('theme', 'nostalgia', 'Дурсамж', 'Nostalgia', 27),
  ('theme', 'humour', 'Хошин', 'Humour', 28),
  ('scene', 'underground', 'Андерграунд', 'Underground', 29),
  ('scene', 'independent', 'Бие даасан', 'Independent', 30),
  ('scene', 'mainstream', 'Мэйнстрийм', 'Mainstream / Commercial', 31),
  ('scene', 'traditional-ensemble', 'Уламжлалт чуулга', 'Traditional ensemble', 32),
  ('mood', 'upbeat', 'Хөгжилтэй', 'Upbeat', 33),
  ('mood', 'energetic', 'Эрч хүчтэй', 'Energetic', 34),
  ('mood', 'romantic', 'Романтик', 'Romantic', 35),
  ('mood', 'melancholic', 'Гунигтай', 'Melancholic', 36),
  ('mood', 'calm', 'Тайван', 'Calm', 37),
  ('mood', 'aggressive', 'Ширүүн', 'Aggressive', 38);

-- Every taxonomy change is a numbered version with its before/after.
create table public.taxonomy_versions (
  version integer primary key,
  action text not null,
  term_id uuid references public.context_terms(id),
  before_data jsonb,
  after_data jsonb,
  reason text not null,
  changed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
insert into public.taxonomy_versions (version, action, after_data, reason)
values (1, 'seed', (select jsonb_agg(jsonb_build_object('dimension', dimension, 'slug', slug) order by sort_order) from public.context_terms),
        'Starting vocabulary from owner decision D7');
create trigger taxonomy_versions_append_only before update or delete on public.taxonomy_versions
  for each row execute function public.prevent_mutation();

-- Tags -----------------------------------------------------------------------
create table public.song_context_tags (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id),
  term_id uuid not null references public.context_terms(id),
  status public.verification_status not null default 'suggested',
  source text not null check (source in ('editor', 'source_genre', 'ai')),
  evidence_url text check (evidence_url is null or evidence_url ~ '^https?://'),
  evidence_note text check (evidence_note is null or length(evidence_note) <= 500),
  model text,
  prompt_version text,
  assigned_by uuid references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  review_reason text,
  assigned_at timestamptz not null default now(),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (song_id, term_id),
  check (source <> 'ai' or (model is not null and prompt_version is not null))
);
create index song_context_tags_status_idx on public.song_context_tags (status, song_id);

create table public.artist_context_tags (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id),
  term_id uuid not null references public.context_terms(id),
  status public.verification_status not null default 'suggested',
  source text not null check (source in ('editor', 'source_genre', 'ai')),
  evidence_url text check (evidence_url is null or evidence_url ~ '^https?://'),
  evidence_note text check (evidence_note is null or length(evidence_note) <= 500),
  model text,
  prompt_version text,
  assigned_by uuid references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  review_reason text,
  assigned_at timestamptz not null default now(),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (artist_id, term_id),
  check (source <> 'ai' or (model is not null and prompt_version is not null))
);

-- A tag's term must belong to a dimension of the right level.
create function public.check_context_tag_level() returns trigger
language plpgsql set search_path = public as $$
declare v_level text;
begin
  select d.level into v_level from context_terms t join context_dimensions d on d.code = t.dimension where t.id = new.term_id;
  if v_level is distinct from (case tg_table_name when 'song_context_tags' then 'song' else 'artist' end) then
    raise exception 'term does not apply at this level';
  end if;
  return new;
end $$;
create trigger song_context_tags_level before insert or update of term_id on public.song_context_tags
  for each row execute function public.check_context_tag_level();
create trigger artist_context_tags_level before insert or update of term_id on public.artist_context_tags
  for each row execute function public.check_context_tag_level();

-- Source genres (provenance kept unchanged) and their reviewed mapping ---------
create table public.song_source_genres (
  song_id uuid not null references public.songs(id),
  source text not null check (source in ('apple_music', 'musicbrainz')),
  value text not null check (length(value) between 1 and 200),
  first_seen_at timestamptz not null default now(),
  chart_entry_id uuid references public.chart_entries(id),
  primary key (song_id, source, value)
);

create table public.source_genre_mappings (
  source text not null check (source in ('apple_music', 'musicbrainz')),
  source_value text not null,
  term_id uuid references public.context_terms(id),
  status public.verification_status not null default 'suggested',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (source, source_value)
);

-- Starting mapping suggestions for Apple's genre names. Suggested only: a data
-- editor reviews each before it produces tag suggestions.
insert into public.source_genre_mappings (source, source_value, term_id)
select 'apple_music', v.value, t.id
from (values ('Pop', 'pop'), ('K-Pop', 'pop'), ('Hip-Hop/Rap', 'hip-hop'), ('R&B/Soul', 'rnb-soul'), ('Rock', 'rock'),
             ('Hard Rock', 'rock'), ('Metal', 'metal'), ('Alternative', 'indie-alternative'), ('Indie Pop', 'indie-alternative'),
             ('Electronic', 'electronic'), ('Dance', 'electronic'), ('Jazz', 'jazz'), ('Classical', 'classical'),
             ('Folk', 'folk-fusion'), ('World', 'traditional'), ('Singer/Songwriter', 'ballad')) v(value, slug)
join public.context_terms t on t.dimension = 'genre' and t.slug = v.slug;

-- Keep every Apple genre name of each charting song (not only the first).
create function public.record_source_genres() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into song_source_genres (song_id, source, value, chart_entry_id)
  select new.song_id, 'apple_music', g, new.id
  from (
    select jsonb_array_elements_text(case when jsonb_typeof(new.raw_metadata->'genreNames') = 'array' then new.raw_metadata->'genreNames' else '[]' end) g
    union
    select nullif(new.raw_metadata->>'primaryGenre', '')
  ) x
  where g is not null and g <> 'Music' and length(g) between 1 and 200
  on conflict do nothing;
  return new;
end $$;
create trigger chart_entries_source_genres after insert on public.chart_entries
  for each row execute function public.record_source_genres();
insert into public.song_source_genres (song_id, source, value, chart_entry_id)
select distinct on (ce.song_id, g) ce.song_id, 'apple_music', g, ce.id
from public.chart_entries ce
cross join lateral (
  select jsonb_array_elements_text(case when jsonb_typeof(ce.raw_metadata->'genreNames') = 'array' then ce.raw_metadata->'genreNames' else '[]' end) g
  union select nullif(ce.raw_metadata->>'primaryGenre', '')
) x
where g is not null and g <> 'Music'
order by ce.song_id, g, ce.id
on conflict do nothing;

-- Artist profiles: versioned calculation runs ----------------------------------
create table public.context_profile_runs (
  id uuid primary key default gen_random_uuid(),
  method_version text not null,
  parameters jsonb not null,
  artists integer not null,
  calculated_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.artist_context_profiles (
  run_id uuid not null references public.context_profile_runs(id),
  artist_id uuid not null references public.artists(id),
  dimension text not null references public.context_dimensions(code),
  term_id uuid not null references public.context_terms(id),
  share numeric(6,5) not null check (share between 0 and 1),
  songs integer not null check (songs >= 0),
  tagged_songs integer not null check (tagged_songs >= 0),
  total_songs integer not null check (total_songs >= 0),
  primary key (run_id, artist_id, dimension, term_id)
);
create trigger context_profile_runs_append_only before update or delete on public.context_profile_runs
  for each row execute function public.prevent_mutation();
create trigger artist_context_profiles_append_only before update or delete on public.artist_context_profiles
  for each row execute function public.prevent_mutation();

insert into public.methodology_versions (code, title, notes, effective_from)
values ('context-profile-v1', 'Artist genre and theme profile v1',
  'An artist''s profile is the share of their verified-tagged songs carrying each term, per dimension, optionally weighted by chart days. Calculated, never typed. Shows how many songs are tagged out of all known songs.',
  '2026-11-16') on conflict (code) do nothing;

create view public.latest_artist_context_profiles with (security_invoker = true) as
select p.* from public.artist_context_profiles p
where p.run_id = (select id from public.context_profile_runs order by created_at desc, id desc limit 1);

-- Access ---------------------------------------------------------------------------
alter table public.context_dimensions enable row level security;
alter table public.context_terms enable row level security;
alter table public.taxonomy_versions enable row level security;
alter table public.song_context_tags enable row level security;
alter table public.artist_context_tags enable row level security;
alter table public.song_source_genres enable row level security;
alter table public.source_genre_mappings enable row level security;
alter table public.context_profile_runs enable row level security;
alter table public.artist_context_profiles enable row level security;

create policy "public reads dimensions" on public.context_dimensions for select to anon, authenticated using (true);
create policy "public reads active terms" on public.context_terms for select to anon, authenticated using (status = 'active');
create policy "staff reads all terms" on public.context_terms for select to authenticated using (public.staff_role() is not null);
create policy "staff reads taxonomy versions" on public.taxonomy_versions for select to authenticated using (public.staff_role() is not null);
create policy "public reads verified song tags" on public.song_context_tags for select to anon, authenticated using (status = 'verified');
create policy "staff reads song tags" on public.song_context_tags for select to authenticated using (public.staff_role() is not null);
create policy "public reads verified artist tags" on public.artist_context_tags for select to anon, authenticated using (status = 'verified');
create policy "staff reads artist tags" on public.artist_context_tags for select to authenticated using (public.staff_role() is not null);
create policy "staff reads source genres" on public.song_source_genres for select to authenticated using (public.staff_role() is not null);
create policy "staff reads genre mappings" on public.source_genre_mappings for select to authenticated using (public.staff_role() is not null);
create policy "public reads profile runs" on public.context_profile_runs for select to anon, authenticated using (true);
create policy "public reads profiles" on public.artist_context_profiles for select to anon, authenticated using (true);

grant select on public.context_dimensions, public.context_terms, public.song_context_tags, public.artist_context_tags,
  public.context_profile_runs, public.artist_context_profiles, public.latest_artist_context_profiles to anon, authenticated;
grant select on public.taxonomy_versions, public.song_source_genres, public.source_genre_mappings to authenticated;

-- Writes ---------------------------------------------------------------------------
create function public.next_taxonomy_version() returns integer
language sql volatile set search_path = public as $$
  select coalesce(max(version), 0) + 1 from taxonomy_versions
$$;

-- Editors (and above) propose terms; administrators approve, edit or retire.
create function public.change_context_term(
  p_action text, p_reason text, p_term uuid default null, p_dimension text default null, p_slug text default null,
  p_label_mn text default null, p_label_en text default null, p_description_mn text default null,
  p_description_en text default null, p_parent uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_role user_role := staff_role();
  v_before jsonb;
  v_id uuid := p_term;
begin
  if coalesce(length(trim(p_reason)), 0) not between 10 and 2000 then raise exception 'a reason of at least 10 characters is required'; end if;
  if p_action = 'propose' then
    if v_role is null or v_role not in ('administrator', 'editor', 'data_editor') then raise exception 'forbidden'; end if;
    insert into context_terms (dimension, slug, label_mn, label_en, description_mn, description_en, parent_id, status, proposed_by)
    values (p_dimension, p_slug, trim(p_label_mn), trim(p_label_en), p_description_mn, p_description_en, p_parent, 'proposed', auth.uid())
    returning id into v_id;
  elsif p_action in ('approve', 'update', 'retire') then
    if v_role is distinct from 'administrator' then raise exception 'forbidden'; end if;
    select to_jsonb(t) into v_before from context_terms t where id = p_term for update;
    if v_before is null then raise exception 'term not found'; end if;
    update context_terms set
      status = case p_action when 'approve' then 'active' when 'retire' then 'retired' else status end,
      label_mn = coalesce(nullif(trim(p_label_mn), ''), label_mn),
      label_en = coalesce(nullif(trim(p_label_en), ''), label_en),
      description_mn = coalesce(p_description_mn, description_mn),
      description_en = coalesce(p_description_en, description_en),
      parent_id = coalesce(p_parent, parent_id),
      updated_at = now()
    where id = p_term;
  else
    raise exception 'invalid action';
  end if;
  insert into taxonomy_versions (version, action, term_id, before_data, after_data, reason, changed_by)
  select next_taxonomy_version(), p_action, v_id, v_before, to_jsonb(t), trim(p_reason), auth.uid() from context_terms t where id = v_id;
  insert into audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, before_data, after_data, reason)
  select auth.uid(), 'user', 'context_term.' || p_action, 'context_term', v_id::text, v_before, to_jsonb(t), trim(p_reason) from context_terms t where id = v_id;
  return v_id;
end $$;
revoke all on function public.change_context_term(text, text, uuid, text, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.change_context_term(text, text, uuid, text, text, text, text, text, text, uuid) to authenticated;

-- Suggest a tag (any staff role for songs; scene labels: editors and
-- administrators only, owner decision D9). Evidence is required.
create function public.suggest_context_tag(p_kind text, p_subject uuid, p_term uuid, p_evidence_url text, p_evidence_note text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_role user_role := staff_role();
  v_dimension text;
  v_id uuid;
begin
  if v_role is null then raise exception 'forbidden'; end if;
  if p_kind not in ('song', 'artist') then raise exception 'invalid tag kind'; end if;
  select dimension into v_dimension from context_terms where id = p_term and status = 'active';
  if v_dimension is null then raise exception 'choose an active term'; end if;
  if v_dimension = 'scene' and v_role not in ('administrator', 'editor') then raise exception 'forbidden'; end if;
  if nullif(trim(coalesce(p_evidence_url, '')), '') is null and coalesce(length(trim(p_evidence_note)), 0) < 10 then
    raise exception 'evidence is required: a source URL or a note of at least 10 characters';
  end if;
  if p_kind = 'song' then
    insert into song_context_tags (song_id, term_id, source, evidence_url, evidence_note, assigned_by)
    values (p_subject, p_term, 'editor', nullif(trim(p_evidence_url), ''), nullif(trim(p_evidence_note), ''), auth.uid())
    on conflict (song_id, term_id) do update
      set status = case when song_context_tags.status = 'verified' then 'verified'::verification_status else 'suggested'::verification_status end,
          evidence_url = coalesce(excluded.evidence_url, song_context_tags.evidence_url),
          evidence_note = coalesce(excluded.evidence_note, song_context_tags.evidence_note),
          updated_at = now()
    returning id into v_id;
  else
    insert into artist_context_tags (artist_id, term_id, source, evidence_url, evidence_note, assigned_by)
    values (p_subject, p_term, 'editor', nullif(trim(p_evidence_url), ''), nullif(trim(p_evidence_note), ''), auth.uid())
    on conflict (artist_id, term_id) do update
      set status = case when artist_context_tags.status = 'verified' then 'verified'::verification_status else 'suggested'::verification_status end,
          evidence_url = coalesce(excluded.evidence_url, artist_context_tags.evidence_url),
          evidence_note = coalesce(excluded.evidence_note, artist_context_tags.evidence_note),
          updated_at = now()
    returning id into v_id;
  end if;
  insert into audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, after_data, reason)
  values (auth.uid(), 'user', 'context_tag.suggested', p_kind || '_context_tag', v_id::text,
          jsonb_build_object('subject', p_subject, 'term', p_term, 'evidenceUrl', p_evidence_url), coalesce(p_evidence_note, p_evidence_url));
  return v_id;
end $$;
revoke all on function public.suggest_context_tag(text, uuid, uuid, text, text) from public, anon;
grant execute on function public.suggest_context_tag(text, uuid, uuid, text, text) to authenticated;

-- Verify, reject (kept as 'unverified') or record a dispute from an artist or
-- label. Writers and analysts cannot verify; scene: editors and admins only.
create function public.review_context_tag(p_kind text, p_tag uuid, p_decision text, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role user_role := staff_role();
  v_before jsonb;
  v_dimension text;
  v_status verification_status;
begin
  if p_kind not in ('song', 'artist') then raise exception 'invalid tag kind'; end if;
  if p_decision not in ('verify', 'reject', 'dispute') then raise exception 'invalid decision'; end if;
  if coalesce(length(trim(p_reason)), 0) not between 10 and 2000 then raise exception 'a reason of at least 10 characters is required'; end if;
  if p_kind = 'song' then
    select to_jsonb(t), c.dimension into v_before, v_dimension from song_context_tags t join context_terms c on c.id = t.term_id where t.id = p_tag for update of t;
  else
    select to_jsonb(t), c.dimension into v_before, v_dimension from artist_context_tags t join context_terms c on c.id = t.term_id where t.id = p_tag for update of t;
  end if;
  if v_before is null then raise exception 'tag not found'; end if;
  if p_decision = 'dispute' then
    if v_role is null then raise exception 'forbidden'; end if;
  elsif v_dimension = 'scene' then
    if v_role is null or v_role not in ('administrator', 'editor') then raise exception 'forbidden'; end if;
  elsif v_role is null or v_role not in ('administrator', 'editor', 'data_editor') then
    raise exception 'forbidden';
  end if;
  v_status := case p_decision when 'verify' then 'verified' when 'reject' then 'unverified' else 'disputed' end;
  if p_kind = 'song' then
    update song_context_tags set status = v_status, reviewed_by = auth.uid(), reviewed_at = now(), review_reason = trim(p_reason), updated_at = now() where id = p_tag;
  else
    update artist_context_tags set status = v_status, reviewed_by = auth.uid(), reviewed_at = now(), review_reason = trim(p_reason), updated_at = now() where id = p_tag;
  end if;
  insert into audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, before_data, after_data, reason)
  values (auth.uid(), 'user', 'context_tag.' || p_decision, p_kind || '_context_tag', p_tag::text, v_before,
          v_before || jsonb_build_object('status', v_status), trim(p_reason));
end $$;
revoke all on function public.review_context_tag(text, uuid, text, text) from public, anon;
grant execute on function public.review_context_tag(text, uuid, text, text) to authenticated;

-- Data editors review how a source genre maps to an Atlas genre.
create function public.review_genre_mapping(p_source text, p_value text, p_term uuid, p_verify boolean, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if staff_role() is null or staff_role() not in ('administrator', 'data_editor') then raise exception 'forbidden'; end if;
  if coalesce(length(trim(p_reason)), 0) not between 10 and 2000 then raise exception 'a reason of at least 10 characters is required'; end if;
  if p_term is not null and not exists (select 1 from context_terms where id = p_term and dimension = 'genre' and status = 'active') then
    raise exception 'source genres map to active genre terms only';
  end if;
  select to_jsonb(m) into v_before from source_genre_mappings m where source = p_source and source_value = p_value;
  insert into source_genre_mappings (source, source_value, term_id, status, reviewed_by, reviewed_at)
  values (p_source, p_value, p_term, case when p_verify then 'verified' else 'unverified' end::verification_status, auth.uid(), now())
  on conflict (source, source_value) do update
    set term_id = excluded.term_id, status = excluded.status, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now();
  insert into audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, before_data, after_data, reason)
  select auth.uid(), 'user', 'genre_mapping.reviewed', 'source_genre_mapping', p_source || ':' || p_value, v_before, to_jsonb(m), trim(p_reason)
  from source_genre_mappings m where source = p_source and source_value = p_value;
end $$;
revoke all on function public.review_genre_mapping(text, text, uuid, boolean, text) from public, anon;
grant execute on function public.review_genre_mapping(text, text, uuid, boolean, text) to authenticated;

-- Turn verified mappings into genre suggestions. The source value is the
-- evidence; an editor still verifies each tag.
create function public.suggest_tags_from_source_genres() returns integer
language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if auth.uid() is not null and (staff_role() is null or staff_role() not in ('administrator', 'data_editor')) then raise exception 'forbidden'; end if;
  with candidates as (
    select distinct on (g.song_id, m.term_id) g.song_id, m.term_id, g.source, g.value
    from song_source_genres g
    join source_genre_mappings m on m.source = g.source and m.source_value = g.value and m.status = 'verified' and m.term_id is not null
    order by g.song_id, m.term_id, g.value
  ), inserted as (
    insert into song_context_tags (song_id, term_id, source, evidence_note, assigned_by)
    select song_id, term_id, 'source_genre', left(case source when 'apple_music' then 'Apple Music genre: ' else 'MusicBrainz genre: ' end || value, 500), auth.uid()
    from candidates
    on conflict (song_id, term_id) do nothing
    returning id
  )
  select count(*) into v_count from inserted;
  if v_count > 0 then
    insert into audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, after_data, reason)
    values (auth.uid(), case when auth.uid() is null then 'system' else 'user' end, 'context_tag.source_suggestions', 'song_context_tag', 'batch',
            jsonb_build_object('count', v_count), 'Suggestions from verified source-genre mappings');
  end if;
  return v_count;
end $$;
revoke all on function public.suggest_tags_from_source_genres() from public, anon;
grant execute on function public.suggest_tags_from_source_genres() to authenticated, service_role;

-- AI suggestions (owner decision D8): suggestions only, from permitted
-- metadata, with model and prompt version. The server calls this.
create function public.record_ai_tag_suggestions(p_model text, p_prompt_version text, p_items jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if coalesce(length(p_model), 0) = 0 or coalesce(length(p_prompt_version), 0) = 0 then raise exception 'model and prompt version are required'; end if;
  with items as (
    select (i->>'songId')::uuid song_id, t.id term_id, left(i->>'note', 500) note
    from jsonb_array_elements(p_items) i
    join context_terms t on t.slug = i->>'term' and t.dimension = i->>'dimension' and t.status = 'active'
    join context_dimensions d on d.code = t.dimension and d.level = 'song'
  ), inserted as (
    insert into song_context_tags (song_id, term_id, source, evidence_note, model, prompt_version)
    select song_id, term_id, 'ai', note, p_model, p_prompt_version from items
    on conflict (song_id, term_id) do nothing
    returning id
  )
  select count(*) into v_count from inserted;
  insert into audit_logs (actor_type, action, entity_type, entity_id, after_data, reason)
  values ('system', 'context_tag.ai_suggestions', 'song_context_tag', 'batch',
          jsonb_build_object('count', v_count, 'model', p_model, 'promptVersion', p_prompt_version), 'AI tag suggestions; editor confirmation required');
  return v_count;
end $$;
revoke all on function public.record_ai_tag_suggestions(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_ai_tag_suggestions(text, text, jsonb) to service_role;

-- Store one profile calculation run (computed by src/modules/context/profile.ts).
create function public.store_context_profile_run(p_method text, p_parameters jsonb, p_rows jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_run uuid;
begin
  if auth.uid() is not null and (staff_role() is null or staff_role() not in ('administrator', 'data_editor', 'editor')) then raise exception 'forbidden'; end if;
  insert into context_profile_runs (method_version, parameters, artists, calculated_by)
  values (p_method, p_parameters, (select count(distinct r->>'artistId') from jsonb_array_elements(p_rows) r), auth.uid())
  returning id into v_run;
  insert into artist_context_profiles (run_id, artist_id, dimension, term_id, share, songs, tagged_songs, total_songs)
  select v_run, (r->>'artistId')::uuid, r->>'dimension', (r->>'termId')::uuid, (r->>'share')::numeric,
         (r->>'songs')::integer, (r->>'taggedSongs')::integer, (r->>'totalSongs')::integer
  from jsonb_array_elements(p_rows) r;
  insert into audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, after_data, reason)
  values (auth.uid(), case when auth.uid() is null then 'system' else 'user' end, 'context_profiles.calculated', 'context_profile_run', v_run::text,
          jsonb_build_object('method', p_method, 'parameters', p_parameters, 'rows', jsonb_array_length(p_rows)), 'Artist context profile calculation');
  return v_run;
end $$;
revoke all on function public.store_context_profile_run(text, jsonb, jsonb) from public, anon;
grant execute on function public.store_context_profile_run(text, jsonb, jsonb) to authenticated, service_role;

comment on table public.song_context_tags is
  'Atlas''s own genre, theme and mood tags for songs. Public only when verified. Evidence is a URL or an editor''s note; never lyrics.';
comment on table public.artist_context_tags is
  'Scene labels for artists (editorial judgement, D9). Never personal or protected attributes.';
