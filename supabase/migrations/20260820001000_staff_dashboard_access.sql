grant select on table
  public.collection_jobs,
  public.calculation_runs,
  public.entity_match_reviews
to authenticated;

create policy "staff reads collection jobs" on public.collection_jobs
  for select to authenticated using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.active
    )
  );

create policy "staff reads calculation runs" on public.calculation_runs
  for select to authenticated using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.active
    )
  );

create policy "staff reads entity match reviews" on public.entity_match_reviews
  for select to authenticated using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.active
    )
  );
