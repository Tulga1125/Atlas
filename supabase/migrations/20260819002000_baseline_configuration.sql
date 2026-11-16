insert into public.platforms (id, code, name, base_region)
values ('00000000-0000-0000-0000-000000000001', 'apple_music', 'Apple Music', 'MN')
on conflict (code) do nothing;

insert into public.charts (
  id,
  platform_id,
  slug,
  name,
  country_code,
  chart_type,
  frequency,
  maximum_entries
)
values (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'apple-music-mongolia',
  'Apple Music Top 100: Mongolia',
  'MN',
  'songs',
  'daily',
  100
)
on conflict (slug) do nothing;

insert into public.methodology_versions (
  id,
  code,
  title,
  notes,
  effective_from
)
values (
  '00000000-0000-0000-0000-000000000020',
  'apple-music-rank-v1',
  'Apple Music daily rank tracking v1',
  'Preserves the ordered Apple Music Top Songs response for the Mongolia storefront. No stream counts or Atlas weighting are inferred.',
  '2026-08-19'
)
on conflict (code) do nothing;
