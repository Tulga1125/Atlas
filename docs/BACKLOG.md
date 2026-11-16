# Atlas backlog

Updated 6 September 2026. Resume from the hosted database setup below. The artist import and UI changes are implemented, but the hosted database migration, import and website acceptance are unfinished.

## Current checkpoint

- The public site and staff dashboard use the full viewport, shared headers and consistent spacing, with English/Mongolian navigation.
- Bundled demo artists, chart data and the demo authentication bypass are removed. An empty, compatible database produces a pending-chart page; actual database errors still surface.
- The MusicBrainz importer, service-only SQL function, source evidence and five-artist curated manifest are ready. The last discovery found 203 country-search candidates plus three exact lookups: 206 identities, with five curated for publication and 201 requiring review.
- That import was exercised only against the isolated test database. Nothing was imported into hosted Supabase. The earlier linked-project check found no artists, songs, chart snapshots or staff profiles; refresh those observations before resuming.
- At the owner's request, both local Atlas database stacks, their Docker containers, volumes and networks, unused Supabase images, generated Next.js output and local test credentials were deleted. Atlas localhost is stopped. Do not recreate those local stacks just to resume development; use hosted Supabase and run database/browser fixture checks on an ephemeral CI runner.
- Code, migrations and `data/artists/curated-mongolian.json` are in Git. The complete discovery snapshot is local-only at `.local/artist-imports/musicbrainz-mn.json`; it must be regenerated on another checkout. Reports there refer to the deleted local test database, not a hosted import.

## Next work, in order

### 1. Set up hosted Supabase with a storage budget

- [ ] Decide which hosted project is development/staging and which is production. Keep the frontend local without a local Postgres service. Preserve separate credentials and disable public staff signup.
- [ ] Recheck the linked project's schema and data before changing it. At the last inspection it had migrations through `20260830001000`; the eleven `20260905…` migrations and `20260906000000_artist_discovery.sql` were still pending remotely.
- [ ] Verify a recoverable hosted backup, review a migration dry run, and apply the pending schema to the intended environment. Confirm the application and database versions together before importing. The earlier interrupted local dump is not a backup.
- [ ] Set database/storage spending limits and growth alerts. Measure source payload, audit, chart-history and index growth; define retention and an object-storage archive plan for larger raw evidence. Preserve checksums, provenance and approved history when archiving.
- [ ] Configure the public URL/key and server credentials through ignored local environment files and deployment secrets. Validate both anonymous public reads and staff-only access.

Done when the hosted schema supports the current app, permissions have been checked, and a storage budget and recovery path are recorded.

### 2. Populate the hosted artist directory

- [ ] Refresh or inspect the exact MusicBrainz snapshot and the [curated manifest](../data/artists/curated-mongolian.json). Current starter identities: The HU, Magnolian, The Lemons, Nisvanis and Mrs M.
- [ ] Run the explicit import against the chosen hosted target, following [ARTIST_IMPORTS.md](ARTIST_IMPORTS.md). Record the target, run ID and actual created/published/pending counts.
- [ ] Replay the same input and verify that it creates no duplicates. Confirm fresh imports preserve staff identity corrections and disputed status.
- [ ] Confirm each starter profile is public with its short biography and source links. Keep the remaining candidates in review; MusicBrainz country association alone does not prove local identity.
- [ ] Check the homepage, directory, artist details and search against hosted data. With no approved chart, show the pending state; do not invent chart history or platform metrics.

```sh
# Discovery only: no database writes.
pnpm artists:discover --curated data/artists/curated-mongolian.json

# After the hosted target and schema are ready: explicit database write.
pnpm artists:import --input .local/artist-imports/musicbrainz-mn.json
```

### 3. Enable staff review and expand coverage

- [ ] Invite the owner/admin and data editor, configure SMTP and callback allowlists, and test a delivered magic link, sign-out and account deactivation.
- [ ] Review the pending artists in `/dashboard/artists`: exact identity, aliases, country/locality, evidence and duplicate candidates. Link Apple Music or YouTube only by checked source IDs; do not match by name alone.
- [ ] Add approved artist/label photographs with source and usage records. Retain initials where media is unavailable.
- [ ] Expand contemporary-artist coverage using official artist/label sites, local music catalogs and submissions, with evidence for each identity. Review MusicBrainz service terms before scheduling routine commercial discovery.

### 4. Finish browser and release verification

- [ ] Run the updated public browser suite in CI. Before local cleanup, the latest recorded run failed the homepage assertion on desktop and mobile because it expected `approved snapshot` instead of the actual `Approved Apple Music snapshot`. The assertion is corrected in this checkpoint; the complete suite still needs a fresh run.
- [ ] Rerun authenticated workflows, migration/upgrade checks and generated database types in CI against the new schema. Do not run fixture seed scripts against the hosted production database.
- [ ] Verify the pending-chart homepage and the populated artist directory at mobile and desktop widths, in both locales. Check source links, artist detail/search, missing-date 404s, real chart JSON/CSV and staff redirects. Full runtime verification against hosted data remains pending.
- [ ] Start Atlas on port 3001 when returning to localhost (`pnpm dev --hostname 127.0.0.1 --port 3001`), with a matching site URL. Port 3000 was used by another project in this session.
- [ ] Record the CI result, tested schema and deployed version in [VERIFICATION.md](VERIFICATION.md). Treat earlier release results as historical evidence.

### 5. Connect real chart collection and launch operations

- [ ] Obtain and configure the Apple Music developer token; validate a real Mongolia Top 100 response and exact artist IDs. YouTube enrichment is optional and still needs its own credentials and reviewed channel links.
- [ ] Exercise collection, retained source evidence, approval and calculation against the real source. Publish the first approved chart without fabricating missing historical dates.
- [ ] Configure the hosted scheduler and worker, health monitoring, notifications and named operators. Observe the seven scheduled staging days and perform hosted recovery/editorial acceptance described in [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

## Verification available at this checkpoint

Before local database cleanup: 40 unit tests, 122 PostgreSQL assertions and the production build passed. The 206-identity import and preservation of existing identities were exercised in the isolated database. The public browser run still had the homepage assertion failures described above; authenticated/browser acceptance and hosted import are not complete for this checkpoint. See [VERIFICATION.md](VERIFICATION.md) for the distinction between this work and the previous release.

## From the YouTube build (16 November 2026)

- **Upgrade `next` to 16.4.1 or later and `zod` to 4.6.6 or later.** Critical published advisories, including unauthenticated remote code execution. Blocks any deployment and the CI audit step.
- Run the Docker suites in CI and replace the hand-edited `database.types.ts` with generated output if `db:types:check` differs.
- Run one live `youtube_discovery` and one `youtube_retention` job in staging; record job IDs in `docs/VERIFICATION.md`.
- B1 (Command Center) and C1 (taxonomy) were skipped to reach A2 sooner; they come next in the execution order, then C2 and A3.
- Song matching scans all active songs for each new video; add a stored title key with an index if the catalogue grows beyond a few thousand songs.
- The recording picker on the review screen lists the first 1,000 songs alphabetically; replace it with search when the catalogue grows.

