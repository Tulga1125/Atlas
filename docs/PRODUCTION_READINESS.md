# Atlas Charts production readiness

The implementation follows `Atlas_Charts_Product_and_Technical_Specification_v1.0.pdf`, with Apple Music Top 100 Mongolia as the only production chart source. Spotify, YouTube charts, blended rankings, Kafka, advertising infrastructure and IFPI-style certification are outside this release. YouTube channel intelligence remains optional, manually configured enrichment.

## Implemented release path

1. The daily scheduler enqueues a business date at 06:00 Asia/Ulaanbaatar. A worker claims a 90-second database lease and performs at most one collection or calculation per invocation.
2. Every received source body is retained with its HTTP status and SHA-256 before parsing. Transport failures retain an attempt record. Invalid, incomplete or repeated historical payloads require review. Retryable failures use bounded attempts and backoff; expired leases can be reclaimed. Apple’s current chart cannot be used to fabricate a missed historical date.
3. Approval requires all 100 distinct source assets and ranks. Approved snapshots, entries and raw evidence are immutable. A reviewed same-day replacement retains the earlier snapshot, connects its revision, and schedules downstream calculations.
4. Recordings retain their source IDs while canonical song mappings can be reviewed, merged, split and undone. Changes require a reason; merge/split execution must match an impact preview. Source ranks are preserved. Identity corrections queue recalculation from the earliest affected day.
5. Versioned calculations retain inputs and configuration, create independent signals and evidence, prepare leads and a Mongolian daily brief. Calendar gaps and unknown historical values remain explicit. Artist aggregation uses canonical credits and counts a song once per day.
6. The newsroom verifies leads, assigns active staff, saves immutable MN/optional EN drafts, submits them to an editor, approves an exact revision and publishes its copy. Writers cannot approve. Revision checks reject stale tabs. Publications and audit records remain immutable.
7. Public pages expose approved daily archives, comparisons via API, weekly collections of daily charts, off-chart song history, artist discography, reviewed articles, search, methodology and source links. Authenticated staff pages remain accessible before the first chart collection. Bundled demo data and demo authentication are removed; public pages show a pending state before the first approved chart.

## Local verification

The local Atlas databases and Docker resources were removed on 6 September to reclaim space. Use the [backlog](BACKLOG.md) to resume with hosted Supabase. The full procedure below recreates local services; run it on an ephemeral CI runner unless local database work is explicitly resumed.

Node 24, pnpm 10.18.3 and Docker are required. The test stack uses API 55321, database 55322 and production web servers 3100 (public) / 3101 (authenticated). It does not use the development database on 54322. Local test credentials are generated into ignored `.env.test.local`. Never reuse fixture passwords or tokens outside that stack.

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm secrets:check
pnpm audit --prod --audit-level=high
pnpm test:setup
pnpm test:upgrade
pnpm test:db
pnpm test:seed
pnpm test:integration
pnpm test:build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:e2e:live
pnpm test:restore
```

`test:upgrade` intentionally resets only the isolated test database to the previous release, ingests a complete legacy chart, upgrades it, and compares the immutable entry contents. It is separate from the non-destructive development workflow. `test:restore` dumps the isolated database, restores into a temporary database, verifies source/calculation/editorial/catalog/audit hashes, and removes the restored copy. This checks local logical recovery; it does not certify hosted recovery, Vault portability, off-site backup retention, or production RPO/RTO.

CI runs these checks on pull requests and pushes to main. Failed browser traces contain only local fixture users and are retained for three days. CI requires no Apple or cloud Supabase credentials. Repository secret checks identify common tokens and private-key patterns; enable GitHub secret scanning/push protection where available as an additional control.

Latest local results are recorded in [VERIFICATION.md](VERIFICATION.md).

## Deployment and launch gates

These require external account configuration and observed production-like runs. They are not satisfied by fixture tests.

- [ ] Owner obtains Apple Music API access, stores a valid signed developer token, and verifies the actual Mongolia response contains the expected 100 songs and usable artist IDs. Confirm permitted display, artwork and attribution against the applicable Apple agreement before public release.
- [ ] Create separate staging and production projects; review a Supabase migration dry run and take a backup before applying migrations. Confirm the deployed application and schema versions together. Run the upgrade checks before each release.
- [ ] Configure HTTPS site URL, server-only service role and cron secrets, public Supabase URL/key. Production startup checks required settings and token expiry. Keep keys in provider secret stores, not Git, issue text, browser code or logs.
- [ ] Enable the email provider while keeping public signups disabled. Configure production SMTP, exact auth callback allowlists, staff invitations and least-privilege roles. Test a delivered magic link, sign-out, account deactivation and expiration in staging.
- [ ] Store `atlas_site_url` and `atlas_cron_secret` in Supabase Vault, review and apply `supabase/operations/install-schedule.sql`. Its UTC schedule corresponds to 06:00 Ulaanbaatar; worker requests are sent only while work is due.
- [ ] Configure an independent uptime/data-health monitor with a named operator. Monitor `/api/internal/data-health` using a protected bearer token. Alert on failure or no successful observation, including an unreachable scheduler/database. `pnpm ops:health` supports machine-readable health logs; it does not send notifications by itself.
- [ ] Observe seven consecutive scheduled staging days, with complete source evidence, 100 approved entries, successful metrics/briefs before 07:00, and no unexplained gaps or duplicate approvals. Record actual job, attempt, snapshot and analysis IDs. Never substitute seven fixture dates for seven observed runs.
- [ ] Complete editorial acceptance in both locales on desktop/mobile: verify, assign, draft, submit, approve, publish and open the public article; test concurrent edits, role denial, canonical correction and undo.
- [ ] Restore a hosted backup into a separate staging project; verify Auth, Vault, source history, publications and audit access. Record achieved RPO/RTO and operator instructions. Provisional targets are RPO ≤24h and RTO ≤4h, subject to the chosen backup tier.
- [ ] Confirm commercial hosting eligibility and budgets. Keep development on free resources where suitable; activate appropriate commercial tiers only at launch. Configure spend limits, retention and storage alerts before traffic grows.
- [ ] Nominate engineering, data and editorial owners; enable required branch checks; record release approval and the tested deployment ID.

## Remaining operating limits

The worker currently replays history from approved source facts for the selected date. Benchmark it against the expected history size before expanding collection scope; the 60-second request / 90-second lease bounds are deliberate. The MVP stores full source responses in Postgres, so monitor growth and move older evidence to durable object storage if retention volume requires it. There is no historical Apple chart backfill without an independently valid historical source.

The weekly page is a seven-day navigation view, not a fabricated weekly Apple ranking. English publication text is optional and must be reviewed with its Mongolian draft. Automated leads and briefs are evidence-based templates, not auto-published articles. Historical analysis and publications remain available after corrections; the latest calculation becomes the active metric view.

Operational procedures and endpoint contracts are in [OPERATIONS.md](OPERATIONS.md) and [API.md](API.md).
