# Atlas Charts: instructions for Claude Code

## What this project is

Atlas Charts is Mongolia's music-chart and music-intelligence platform. It collects the **Apple Music Top 100 Mongolia** every day, keeps every approved chart permanently with its source evidence, calculates movement and signals, and runs an editorial newsroom that turns verified signals into published stories. It has a public bilingual (Mongolian/English) website and a private staff dashboard.

Owner: Tulga (Ulaanbaatar). Business timezone: `Asia/Ulaanbaatar`.

## Your job

**Build everything in `docs/BUILD_ORDER.md`, from Phase 0 to Phase Z, in one autonomous run.** The phases cover:

- **Part A:** a YouTube data layer, including comment sentiment.
- **Part B:** deeper chart intelligence.
- **Part C:** artist pages with genre, theme, scene and mood context.

Owner decisions are in `docs/DECISIONS.md`, so use them instead of asking. Track progress in `docs/PROGRESS.md` and commit after each phase.

Stop and ask **only** before:

- writing to or migrating a hosted Supabase project;
- anything that costs money;
- deleting data outside a test environment;
- a ground rule that can't be kept.

Missing API keys or missing Docker/browser tooling never block the build: use fixtures, mark the live check as pending in `docs/VERIFICATION.md`, and continue.

## Where things are

| Path | What |
|---|---|
| `src/app/` | Next.js App Router pages: public site, `/dashboard` (staff), `/api/v1` (public API), `/api/internal` (worker, jobs, data health; bearer `CRON_SECRET`) |
| `src/modules/` | Domain logic: `apple-music`, `collection`, `analytics` (chart metrics and signals), `charts`, `artists`, `artist-sources` (Apple/YouTube channel clients), `artist-review`, `newsroom`, `operations` (worker), `dashboard`, `i18n` |
| `src/lib/env.ts` | Environment validation (zod). Add new variables here. |
| `src/lib/supabase/` | Supabase clients and generated `database.types.ts` |
| `supabase/migrations/` | Postgres schema, additive only; latest is `20260906000000_artist_discovery.sql` |
| `supabase/tests/database/` | pgTAP tests |
| `scripts/` | Test-stack, import, health and type-generation scripts |
| `tests/` | Integration (`integration`), browser (`e2e`, `e2e-live`), fixtures |
| `data/artists/curated-mongolian.json` | Five curated starter artists |
| `docs/*.md` | Operations, API, readiness, backlog, verification, artist import docs |
| `docs/reference/*.txt` | Text versions of the product spec, technical blueprint, architecture, strategy and brand guidelines. **The spec (`SPEC_Atlas_Charts_v1.0.txt`) is the product authority.** |
| `docs/mockups/*.png` | UI mockup images |

## Stack

Next.js 16.3, React 19.2, TypeScript 5.9 (strict), Tailwind CSS 4, Supabase (Postgres, Auth, RLS, pg_cron, Vault), zod 4, Recharts 3, Vitest 4, Playwright 1.62, pnpm 10.18.3, Node 24.

`package.json` was **reconstructed** from the original installed dependencies, because the export didn't include it. Other config files (tsconfig, next, eslint, postcss, vitest, playwright, CI) must be recreated in Phase 0.

## Environment variables

See `.env.example`. These are set as secrets in the cloud environment, never committed:

| Variable | Needed for | Status |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public data | Owner sets |
| `SUPABASE_SERVICE_ROLE_KEY` | Server, collectors | Owner sets |
| `CRON_SECRET` | Scheduler and internal endpoints | Owner sets |
| `NEXT_PUBLIC_SITE_URL` | Links, auth callbacks | Owner sets |
| `APPLE_MUSIC_DEVELOPER_TOKEN` | Daily Apple chart | Pending |
| `YOUTUBE_API_KEY` | YouTube phases | Created (project `atlas-charts`) |
| `ANTHROPIC_API_KEY`, `ATLAS_AI_MODEL` | Tag suggestions, comment sentiment, optional AI drafting | Pending; model default `claude-haiku-5-5` |

## Non-negotiable rules (full list in `docs/BUILD_ORDER.md`)

1. **Evidence before narrative.** Everything links to source payloads, snapshots and calculation runs.
2. **Approved history is immutable.** The only deletions are the documented YouTube retention rules.
3. **Never fabricate** data, ranks or missing days.
4. **Never link platform assets by name alone.**
5. **Rules before statistics before ML.** Everything is versioned.
6. **Humans publish.** AI suggests and drafts only.
7. **Additive migrations,** with regenerated types and pgTAP tests for new tables, policies and functions.
8. **Reuse the existing job and lease pipeline.**
9. **Mongolian and English** for every UI string.
10. **Secrets server-only.**
11. **Never store song lyrics.**
12. **Never store YouTube commenter identities.**
13. **Never infer protected attributes** of artists or audiences.
14. **Never run fixture seed scripts against a hosted database.** Never point test scripts at anything but the isolated local stack (ports 55321/55322).

## Commands

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm secrets:check && pnpm build
# With Docker (isolated local test stack):
pnpm test:setup && pnpm test:db && pnpm test:seed && pnpm test:integration && pnpm test:e2e
pnpm db:types        # after schema changes (needs local stack)
```

## Kickoff prompt (for the owner to paste)

> Read `CLAUDE.md`, then `docs/BUILD_ORDER.md` and `docs/DECISIONS.md`. Build everything in `docs/BUILD_ORDER.md` from Phase 0 to Phase Z in the execution order, without stopping for approval between phases. Use the decisions in `docs/DECISIONS.md`. Track progress in `docs/PROGRESS.md` and commit after each phase. Only stop for the cases listed under "How to use this file".
