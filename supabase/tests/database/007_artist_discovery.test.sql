begin;
select plan(15);
select function_privs_are('public', 'import_musicbrainz_artists', array['jsonb','jsonb'], 'anon', array[]::text[], 'anonymous callers cannot import or publish artists');
select function_privs_are('public', 'import_musicbrainz_artists', array['jsonb','jsonb'], 'authenticated', array[]::text[], 'staff import is not a public RPC');
select function_privs_are('public', 'import_musicbrainz_artists', array['jsonb','jsonb'], 'service_role', array['EXECUTE'], 'server import is authorized');
create temporary table import_input as select
  '{"source":"musicbrainz","query":"country:MN","fetchedAt":"2026-09-06T00:00:00Z","count":2,"artists":[{"id":"90000000-0000-4000-8000-000000000001","name":"Import Test Artist","country":"MN","type":"Person","aliases":[{"name":"Alias","locale":"en"},{"name":"Alias","locale":"en"}]},{"id":"90000000-0000-4000-8000-000000000002","name":"Unreviewed Test Artist","country":"MN","type":"Group"}]}'::jsonb as payload,
  '[{"mbid":"90000000-0000-4000-8000-000000000001","name":"Curated Test Artist","biography":"Test-only biography.","sourceUrl":"https://example.com/artist","sourceName":"Test source","evidenceType":"official_profile","notes":"Test-only source evidence.","checkedAt":"2026-09-06"}]'::jsonb as curated;
create temporary table import_result as select public.import_musicbrainz_artists(payload, curated) as result from import_input;
select is((select result->>'created' from import_result), '2', 'imports candidates and curated identities atomically');
select is((select verification::text from artists where source_key='musicbrainz:90000000-0000-4000-8000-000000000002'), 'suggested', 'country association does not automatically verify candidates');
select is((select locality::text from artists where source_key='musicbrainz:90000000-0000-4000-8000-000000000002'), 'unknown', 'candidate locality remains unknown');
select is((select verification::text from artists where source_key='musicbrainz:90000000-0000-4000-8000-000000000001'), 'verified', 'explicit curated identity is published');
select is((select count(*)::integer from artist_aliases where alias='Alias'), 1, 'deduplicates aliases');
select is((select count(*)::integer from artist_verification_evidence where payload->>'review_source'='curated_import'), 1, 'retains curated evidence with truthful provenance');
select is((select count(*)::integer from artist_source_payloads where run_id=(select (result->>'runId')::uuid from import_result)), 1, 'retains source payload');
select is((select public.import_musicbrainz_artists(payload, curated)->>'replayed' from import_input), 'true', 'same manifest replay is a no-op');
update artists set canonical_name='Staff correction', verification='disputed' where source_key='musicbrainz:90000000-0000-4000-8000-000000000001';
select is((select public.import_musicbrainz_artists(jsonb_set(payload,'{fetchedAt}','"2026-09-07T00:00:00Z"'),curated)->>'existingPreserved' from import_input), '2', 'fresh import preserves existing identities');
select is((select canonical_name || ':' || verification::text from artists where source_key='musicbrainz:90000000-0000-4000-8000-000000000001'), 'Staff correction:disputed', 'fresh curated manifest cannot undo staff decisions');
select throws_ok($q$select public.import_musicbrainz_artists(payload,jsonb_set(curated,'{0,sourceUrl}','"javascript:alert(1)"')) from import_input$q$, 'P0001', 'curated identities require a matching MBID and checked source evidence', 'rejects unsafe evidence URLs');
select throws_ok($q$select public.import_musicbrainz_artists(jsonb_set(payload,'{count}','3'),curated) from import_input$q$, 'P0001', 'incomplete or duplicate MusicBrainz import', 'rejects incomplete batches');
select * from finish();
rollback;
