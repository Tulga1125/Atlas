create or replace function public.save_story(p_id uuid,p_revision integer,p_action text,p_values jsonb default '{}'::jsonb) returns integer
language plpgsql security definer set search_path=public as $$
declare l story_leads; role user_role:=staff_role(); d editorial_drafts; next_status story_status; draft_id uuid; target uuid;
begin
  if role is null or role not in ('administrator','editor','writer') then raise exception 'forbidden'; end if;
  select * into l from story_leads where id=p_id for update;
  if not found then raise exception 'story not found'; end if;
  if l.revision<>p_revision then raise exception 'conflict: reload the latest revision'; end if;
  if role='writer' and (l.assigned_to is distinct from auth.uid() or p_action not in ('draft','submit')) then raise exception 'forbidden'; end if;
  next_status:=l.status;
  case p_action
    when 'verify' then
      if l.status not in ('detected','needs_verification') then raise exception 'invalid transition'; end if;
      next_status:='verified';
    when 'assign' then
      if l.status not in ('verified','assigned','drafting','editing') then raise exception 'invalid transition'; end if;
      target:=(p_values->>'assignee')::uuid;
      if not exists(select 1 from profiles p where p.id=target and p.active and p.role in ('writer','editor','administrator')) then raise exception 'invalid assignee'; end if;
      update story_leads set assigned_to=target,editor_id=auth.uid(),deadline=nullif(p_values->>'deadline','')::timestamptz where id=p_id;
      next_status:='assigned';
    when 'draft' then
      if l.status not in ('assigned','drafting','editing') then raise exception 'invalid transition'; end if;
      insert into editorial_drafts(story_id,author_id,headline_mn,body_mn,headline_en,body_en) values(p_id,auth.uid(),trim(p_values->>'headlineMn'),p_values->>'bodyMn',nullif(trim(p_values->>'headlineEn'),''),nullif(p_values->>'bodyEn','')) returning id into draft_id;
      next_status:='drafting';
    when 'submit' then
      if l.status<>'drafting' or not exists(select 1 from editorial_drafts where story_id=p_id and length(trim(body_mn))>0) then raise exception 'draft required'; end if;
      next_status:='editing';
    when 'approve' then
      if l.status<>'editing' then raise exception 'invalid transition'; end if;
      select * into d from editorial_drafts where story_id=p_id order by created_at desc,id desc limit 1;
      if d.id is null or length(trim(d.body_mn))=0 or ((d.headline_en is null)<>(d.body_en is null)) then raise exception 'complete draft required'; end if;
      update story_leads set approved_draft_id=d.id,editor_id=auth.uid() where id=p_id;
      next_status:='approved';
    when 'publish' then
      if l.status not in ('approved','published') or l.approved_draft_id is null then raise exception 'approval required'; end if;
      select * into d from editorial_drafts where id=l.approved_draft_id and story_id=p_id;
      insert into publications(story_id,draft_id,headline_mn,body_mn,headline_en,body_en,author_id,editor_id,source_facts,channel,external_url)
      values(p_id,d.id,d.headline_mn,d.body_mn,d.headline_en,d.body_en,d.author_id,auth.uid(),l.supporting_facts,coalesce(p_values->>'channel','atlas'),nullif(p_values->>'url',''));
      next_status:='published';
    when 'archive' then
      if l.status<>'published' then raise exception 'invalid transition'; end if;
      next_status:='archived';
    when 'dismiss' then
      if l.status in ('published','archived') or length(trim(coalesce(p_values->>'reason','')))<10 then raise exception 'dismissal reason required'; end if;
      next_status:='dismissed';
    else raise exception 'unknown action';
  end case;
  update story_leads set status=next_status,revision=revision+1,updated_at=now() where id=p_id;
  insert into audit_logs(actor_user_id,actor_type,action,entity_type,entity_id,before_data,after_data,reason)
  values(auth.uid(),'user','story.'||p_action,'story_lead',p_id::text,to_jsonb(l),jsonb_build_object('status',next_status,'revision',l.revision+1,'draftId',draft_id),p_values->>'reason');
  return l.revision+1;
end $$;
