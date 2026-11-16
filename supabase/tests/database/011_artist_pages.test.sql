begin;
select plan(4);
select function_privs_are('public', 'subject_publications', array['uuid','uuid'], 'anon', array['EXECUTE'], 'the public can list articles about a subject');
select is((select count(*)::integer from public.subject_publications(gen_random_uuid(), null)), 0, 'an unknown artist has no articles');
select is((select count(*)::integer from public.subject_publications(null, null)), 0, 'no subject, no articles');
select ok(not exists (
  select 1 from pg_proc p cross join lateral unnest(p.proargnames) a(name)
  where p.proname = 'subject_publications' and a.name in ('body_mn', 'body_en', 'source_facts', 'author_id', 'story_id')),
  'only public headline fields are returned, never story or author internals');
select * from finish();
rollback;
