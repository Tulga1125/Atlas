# Verification — 16 November 2026: Phase 0, A1 and A2

Checked in a Claude Code cloud session on Node 24.22.3 and pnpm 10.18.3. No Docker was available, so the Supabase CLI stack (Auth, PostgREST, Studio) could not start. Database tests ran instead on a throwaway local PostgreSQL 16 cluster with a minimal Supabase stand-in (`scripts/test-database-plain.mjs`, `pnpm test:db:plain`): roles `anon`, `authenticated`, `service_role`, an `auth.users` table and `auth.uid()`. The hosted target is PostgreSQL 17. CI runs the real stack.

| Check | Result |
| --- | --- |
| `pnpm lint` (recreated `eslint.config.mjs`) | Passed |
| `pnpm typecheck` (recreated `tsconfig.json`) | Passed |
| `pnpm test` | 122 passed in 16 files (40 existing + 82 new) |
| `pnpm secrets:check`, `git diff --check` | Passed |
| `pnpm build` (placeholder public env) | Passed; `/dashboard/catalog/youtube` built |
| pgTAP via `pnpm test:db:plain` | 222 passed: 122 existing (unchanged), 39 retention (`008`), 61 catalogue (`009`) |
| Review screen layout | Rendered the card markup with the real stylesheet at 1280 px and 390 px: no horizontal overflow. Not a live page render. |
| `pnpm audit --prod --audit-level=high` | **Failed: 14 advisories in the pinned dependencies, not introduced by this work.** `next` 16.3.1 has 5 critical (unauthenticated remote code execution in image optimisation, `use cache`, `next/og`) and 2 high; fixed in **16.4.1**. `zod` 4.4.3 has 1 high (memory exhaustion); fixed in **4.6.6**. Upgrade before any deployment. CI fails on this step until then. |

## Not run here (pending)

- `pnpm test:setup`, `test:upgrade`, `test:db` (Supabase CLI), `db:types:check`, `test:seed`, `test:integration`, `test:build`, `test:e2e`, `test:e2e:live`, `test:restore`: need Docker. `.github/workflows/ci.yml` runs them.
- **Generated database types:** `src/lib/supabase/database.types.ts` was updated by hand in the generator's format because `supabase gen types` needs Docker. `db:types:check` in CI is the authority; if it differs, run `pnpm db:types` and commit the result.
- **New browser test** "a data editor links a discovered YouTube video to a song" (`tests/e2e-live/workflows.spec.ts`): written, not run.
- **Live YouTube:** `YOUTUBE_API_KEY` is set in this session, but no live discovery ran: the worker needs the database stack, and a live check should record a job ID against staging. Pending: run one `youtube_discovery` job in staging and record the job ID, quota units and counts.
- **Retention job in staging:** pending one scheduled run with its `retention_runs` row and audit records.
- **Hosted Supabase:** the two new migrations were not pushed (owner action).

## What the new tests prove

- **A1:** expired YouTube payloads become tombstones that keep their checksum and fetch time; expired YouTube statistics are deleted; channel names and images are stripped while Atlas review data stays; Apple payloads, metrics and profiles are untouched, even with the retention flag forged; every run and every batch is audited, with counts and no content; repeat runs are idempotent; 36-month mode keeps statistics while still expiring metadata at 30 days; only administrators change the mode, with a reason, a new methodology version and an audit row. Unit tests cover both modes' cutoffs, including month-end clamping and the Ulaanbaatar business date.
- **A2:** writers cannot link; anonymous users cannot read YouTube assets (D3) but still read Apple assets; one row per video ID; workers without the lease cannot write; an unverified channel never auto-links; verified channel plus exact title auto-links only as "suggested", still in the review queue; partial and missing matches are suggestions or nothing; every editor action needs a reason and is audited without YouTube metadata; review evidence holds no titles; the API key is refused in stored URLs; retention clears video titles but never links. The SQL title matcher returns the same keys as the TypeScript one for the shared Cyrillic/Latin pairs.

# Earlier: local release verification — 6 September 2026

## Current UI and artist-import checkpoint

The newer full-viewport UI, removal of demo data/authentication and MusicBrainz import are a separate checkpoint from the release results below. Before the local databases were deleted, 40 unit tests, 122 PostgreSQL assertions and a production build passed. The real discovery input created 206 identities in the isolated test database: five curated for publication and 201 pending review. A fresh import preserved the existing identities; SQL assertions also covered exact replay, evidence, permissions and staff corrections.

The latest public browser run recorded homepage assertion failures in both browser projects: the assertion omitted `Apple Music` from the page's actual `Approved Apple Music snapshot` copy. That assertion is now corrected, but a complete rerun is pending. Earlier authenticated, integration, restore and preview results below do not certify this newer checkpoint.

Both local Atlas databases and their Docker resources were subsequently removed at the owner's request. The hosted schema update, artist import and runtime acceptance have not been completed. Continue with [BACKLOG.md](BACKLOG.md), using hosted Supabase and CI rather than recreating the local databases by default.

## Previous production-workflow release

Verified on Node 24.14.0, pnpm 10.18.3, Next.js 16.3.1 and local Supabase CLI 2.115.0. The database/API stack was isolated from the development database. Source responses and staff accounts used local fixtures; no Apple API or hosted production deployment was exercised.

| Check | Result |
| --- | --- |
| ESLint and strict TypeScript, including generated route/database types | Passed |
| Unit tests | 36 passed |
| PostgreSQL RLS, ingestion, review, publication, immutability and lease assertions | 107 passed |
| Pipeline integration against local PostgREST | 3 passed |
| Production build | Passed |
| Preview browser tests, desktop/mobile | 22 passed |
| Authenticated browser tests, desktop/mobile | 10 passed |
| Upgrade from previous schema with an existing approved 100-entry snapshot | Passed; entry contents unchanged |
| Database schema lint on final upgraded test schema | No issues |
| Generated types compared with final test schema | Matched |
| Scheduler SQL install inside a rollback-only transaction | Passed; no schedule installed |
| Full local logical dump/restore | Passed; matching hashes across 10 source, analysis, editorial, catalog and audit tables |
| Production dependency audit | No known vulnerabilities reported |
| Repository credential-pattern check and diff whitespace check | Passed |

The authenticated browser tests follow a real locally delivered magic link, reject public signup, verify private endpoint access, publish a Mongolian article through all approval states, inspect off-chart history, navigate both locales without page overflow, and preview/apply/undo a canonical merge. PostgreSQL independently checks writer/editor/admin permissions and stale revisions.

The worker integration retains malformed HTML and HTTP 429 response bodies before retry, honors backoff, approves a complete response and creates 100 versioned metric records plus a brief. Reversed input order produces the same calculation result. These checks validate the application contract with fixture source data; actual Apple authorization, response behavior and content permissions remain unverified.

This report does not certify production readiness by itself. Complete the external account, SMTP, monitoring, seven-day scheduled staging observation and hosted recovery gates in [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md). The GitHub workflow is present in the working tree; its first hosted execution and required-branch-check configuration remain to be performed after publication.
