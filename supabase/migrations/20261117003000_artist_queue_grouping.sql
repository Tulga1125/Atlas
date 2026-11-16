-- Artist queue: one proposal per chart name. Apple's feed creates one artist
-- record per song, so a proposal covers every record with that name.
alter table public.artist_proposals add column also_apple_artist_ids uuid[] not null default '{}';

-- Records a proposal for a group of same-name Apple records, or adds the new
-- records to the open proposal for that name.
create function public.record_artist_proposal_group(p_apple_artists uuid[], p_proposal text, p_target uuid, p_channel text, p_co_artists uuid[], p_evidence jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text := lower(trim(p_evidence->>'appleName'));
begin
  if coalesce(cardinality(p_apple_artists), 0) = 0 then raise exception 'no artists'; end if;
  select id into v_id from artist_proposals
    where status = 'open' and (lower(trim(evidence->>'appleName')) = v_name or apple_artist_id = any(p_apple_artists) or also_apple_artist_ids && p_apple_artists)
    order by created_at limit 1;
  if v_id is not null then
    update artist_proposals set also_apple_artist_ids = (
      select coalesce(array_agg(distinct x), '{}') from unnest(also_apple_artist_ids || p_apple_artists) x where x <> artist_proposals.apple_artist_id)
    where id = v_id;
    return v_id;
  end if;
  if exists (select 1 from artist_proposals where status = 'rejected' and lower(trim(evidence->>'appleName')) = v_name and evidence = p_evidence) then return null; end if;
  insert into artist_proposals (apple_artist_id, also_apple_artist_ids, proposal, target_artist_id, channel_id, co_artist_ids, evidence)
  values (p_apple_artists[1], p_apple_artists[2:], p_proposal, p_target, p_channel, coalesce(p_co_artists, '{}'), p_evidence)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.record_artist_proposal_group(uuid[], text, uuid, text, uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.record_artist_proposal_group(uuid[], text, uuid, text, uuid[], jsonb) to service_role;

-- Drafts from before grouping are replaced by grouped ones.
update public.artist_proposals set status = 'superseded' where status = 'open';
