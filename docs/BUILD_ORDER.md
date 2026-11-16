# Atlas Charts: build order for YouTube data, deeper intelligence and artist pages

Prepared 16 November 2026 for Claude Code (cloud). Version 2: **autonomous, start-to-finish build.**

## How to use this file

- **Build everything in this file in one continuous run.** Follow the "Execution order" section near the end. Do not wait for approval between phases.
- **Owner decisions are already made.** They are in `docs/DECISIONS.md`. Use them; do not stop to ask about them.
- **Keep a progress log** in `docs/PROGRESS.md`: tick each phase when its acceptance checks pass, note anything skipped and why. If the session ends or context runs out, the next session resumes from the first unticked phase.
- **Commit after every phase** with a message like `feat(A3): daily YouTube statistics collector`. Never commit secrets.
- **Missing credentials never block the build.** If a key is not set (Apple token, YouTube key, Anthropic key), build the feature fully, test it with fixtures, keep the live path behind its environment check, mark "live check pending" in `docs/VERIFICATION.md`, and move on.
- **Missing database or browser tooling never blocks the build.** If Docker or a browser isn't available in the cloud environment, still write the pgTAP and Playwright tests, run everything that can run (lint, typecheck, unit tests, build), and list unrun suites in `docs/VERIFICATION.md`.
- **Only stop and ask the owner** for: writing to or migrating a **hosted** Supabase project (staging or production), anything that costs money, deleting data outside a test environment, or a ground rule that turns out to be impossible to keep.
- The source documents (spec, blueprint, strategy, brand guidelines) are in `docs/reference/` as text files. UI mockup images are in `docs/mockups/`.

## Ground rules for every phase

These come from the product spec (`docs/reference/SPEC_Atlas_Charts_v1.0.txt`) and the existing codebase. Do not break them.

1. **Evidence before narrative.** Every metric, signal and brief item links to the exact source payload, snapshot and calculation run that produced it.
2. **History is immutable.** Corrections create revisions and audit records. Never update or delete approved facts in place. Exception: the YouTube retention rules in Phase A1, which are a legal requirement and must be handled explicitly, never silently.
3. **Never fabricate.** A missed collection day stays a gap. Today's numbers are never used to fill in yesterday.
4. **One song, many assets.** YouTube videos are platform assets linked to canonical recordings and songs. Never link by title or artist name alone; a data editor confirms every link.
5. **Explainable first.** Use transparent rules before statistics, and statistics before machine learning. Every rule and formula is versioned (`methodology_versions`, `formulaVersion`).
6. **Humans publish.** Automation detects and drafts; editors verify and approve.
7. **Additive migrations only.** New migrations go after `20260906000000_artist_discovery.sql`. Regenerate `src/lib/supabase/database.types.ts` after every schema change. Add pgTAP tests in `supabase/tests/database/` for every new table, RLS policy and function.
8. **Reuse the pipeline.** New collectors use the existing `pipeline_jobs` / `collection_jobs` / `collection_attempts` / `raw_payloads` pattern: database lease, retained raw response with SHA-256, bounded retries, idempotency key per business date. Do not build a second job system.
9. **Both locales.** Every new UI string goes into `src/modules/i18n/dictionaries.ts` in Mongolian and English.
10. **Secrets server-only.** `YOUTUBE_API_KEY` already exists in `src/lib/env.ts`. Add `ANTHROPIC_API_KEY` (and `ATLAS_AI_MODEL`, default `claude-haiku-5-5`) the same way, as optional variables. Keep all keys out of client bundles, logs and stored URLs (the existing YouTube client already strips the key from the stored `sourceUrl`; keep that behaviour). List every variable in `.env.example`.
11. **Match the existing code style.** Follow the patterns in `src/modules/*` (zod schemas, small modules, repository files, colocated `*.test.ts`), the existing UI components, and the brand colours already in `src/app/globals.css`.
12. **Feature flags for anything public that the decisions keep private.** E.g. the public YouTube ranking and public sentiment exist in code but stay off until the owner changes `docs/DECISIONS.md` and the matching configuration.

## Facts about the YouTube API that shape this plan

Checked 16 November 2026. Claude Code should re-check the linked pages before Phase A3, because they change often.

- **There is no official YouTube music chart for Mongolia available through the API.** YouTube Charts (charts.youtube.com) has no public API, and scraping it is not allowed. Atlas therefore cannot ingest a "YouTube Top 100 Mongolia" the way it ingests Apple Music. Instead, Atlas will measure a **tracked catalogue** of videos it chooses and verifies.
- **View counts are global, not Mongolian.** `viewCount` counts views from every country. Any YouTube ranking Atlas builds must be labelled "global views of tracked Mongolian-market videos", never "Mongolia's YouTube consumption". The spec already warns against claiming national completeness (§2.2, §5.5).
- **`videos.list` with `chart=mostPopular&regionCode=MN`** now returns videos from YouTube's Trending Music, Movies and Gaming charts, since the July 2025 retirement of the Trending page ([revision history](https://developers.google.com/youtube/v3/revision_history)). Whether it returns anything useful for Mongolia is **unknown**; Phase A5 tests it.
- **Quota.** The default is 10,000 units per day. `videos.list` costs 1 unit per call (up to 50 video IDs). `playlistItems.list` costs 1 unit. `search.list` costs 100 units and, since June 2026, uses its own quota bucket. A new `videos.batchGetStats` method (June 2026) returns statistics for many videos at 1 unit per call in its own bucket. Tracking 2,000 videos daily costs about 40 units, so quota is not a constraint; `search.list` is the only expensive call.
- **View counting changed on 27 August 2026.** Long-form, Live and Shorts views now count when playback starts. Shorts counting also changed in March 2025. Store a methodology-break marker so later comparisons don't mix regimes.
- **Storage limits (critical).** By default, statistics retrieved without user authorization (which is what Atlas does with an API key) may be stored for **at most 30 days** before being refreshed or deleted. Developers who apply for and are accepted under YouTube's [derived metrics policy](https://developers.google.com/youtube/terms/derived-metrics-policy) (use case "Analytics & Reporting") may keep statistics such as views, likes and subscriber counts, and their own derived metrics, for **up to 36 calendar months**. Titles, descriptions and creator names must still be refreshed or deleted within 30 days. Derived metrics must be clearly distinguished from YouTube's own data, and leaderboards and historical comparisons are a listed acceptable use.
  - Consequence: Atlas's "keep everything forever" rule **cannot apply to YouTube data**. Phase A1 designs around this.
  - The existing `artist_metric_snapshots` table already stores YouTube channel statistics with no retention limit. This is a compliance gap to fix in A1.

## Owner decisions

All ten decisions (D1–D10) are recorded in `docs/DECISIONS.md`, including the starting genre, theme, scene and mood vocabulary in Mongolian and English. Where this file says "per D4" and so on, read the answer there.

---

# Phase 0: Make the repository build and test

**Why:** this copy of Atlas came from an export. It has the source, migrations, tests and scripts, but the original tooling files were missing: `package.json` (a reconstruction is now included), lockfile, `tsconfig.json`, Next.js, ESLint, PostCSS, Vitest and Playwright configs, `.github/workflows`, and git history.

1. If there is no git repository yet, run `git init`, commit the files as received ("chore: import Atlas export"), then work on branch `feature/youtube-intelligence`.
2. Check the reconstructed `package.json`. Dependency versions are exact copies of what the original install used. The `scripts` were rebuilt from `scripts/*.mjs` and the commands named in `docs/PRODUCTION_READINESS.md`; fix any that don't match what the scripts expect.
3. Recreate the missing config files so the existing code works unchanged:
   - `tsconfig.json`: strict mode, `@/*` path alias to `src/*` (the code imports `@/modules/...`), Next.js plugin.
   - `next.config.ts`, `postcss.config.mjs` (Tailwind v4 via `@tailwindcss/postcss`), `eslint.config.mjs` (`eslint-config-next`), `vitest.config.ts` (unit tests in `src/**/*.test.ts` and `scripts/**/*.test.mjs`; keep `tests/integration` separate for `test:integration`), `playwright.config.ts` (projects `chrome` and `mobile`, web server via `scripts/start-test-server.mjs`, specs in `tests/e2e` and `tests/e2e-live`).
   - `.github/workflows/ci.yml` running the checks listed in `docs/PRODUCTION_READINESS.md`.
4. Run `pnpm install` (this creates the lockfile), then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm secrets:check`, `pnpm build`. Fix configuration problems, not product behaviour. The previous recorded state was 40 passing unit tests and a passing production build.
5. If Docker is available, run the local test stack (`pnpm test:setup`, `test:db`, `test:integration`, `test:e2e`). If not, record that in `docs/VERIFICATION.md` and continue.
6. Create `docs/PROGRESS.md` with a checklist of every phase in the execution order.

**Acceptance:** lint, typecheck, unit tests and build pass, or every failure is listed with its cause. Record in `docs/VERIFICATION.md`.

---

# Part A: YouTube data layer

## A1. YouTube retention and compliance model

**Goal:** store YouTube data in a way that obeys the 30-day / 36-month rules without breaking Atlas's audit trail.

Tasks:
1. Add a `retention_class` concept for source data: `permanent` (Apple and Atlas facts), `youtube_statistics` (views, likes, comments, subscribers, and Atlas metrics derived from them), `youtube_metadata` (titles, descriptions, channel names, thumbnails).
2. Add configuration for the active YouTube mode: `30_day` (default) or `36_month` (only after D2 is accepted). Store the mode change as an audited methodology version.
3. Write a scheduled retention job (same worker pattern) that:
   - deletes or refreshes `youtube_metadata` older than 30 days;
   - deletes `youtube_statistics` older than the active window;
   - writes an audit record for each deletion batch (counts, date range, retention class; no deleted content);
   - never touches Apple Music or editorial records.
4. Keep the evidence chain honest: when raw YouTube payloads are deleted, keep a **tombstone** row with the original checksum, fetch time and "deleted under YouTube retention policy". Signals and leads that cited the data keep pointing at the tombstone.
5. Bring the existing channel statistics in `artist_metric_snapshots` and `artist_source_payloads` under the same retention job.
6. Add a short public methodology note (MN/EN) explaining that YouTube figures are global views and are kept for a limited period under YouTube's terms.

**Acceptance:** pgTAP tests prove the job deletes only expired YouTube rows, leaves tombstones, audits each run, and cannot delete Apple data. A unit test covers both modes.

## A2. YouTube video catalogue and song linking

**Goal:** a reviewed list of which YouTube videos represent which Atlas songs.

Tasks:
1. Extend `platform_assets` (or add a `youtube_video_assets` table if cleaner) with: `video_id`, `channel_id`, `asset_kind` (per D4: `official_music_video`, `official_audio`, `lyric_video`, `live`, `other`), `published_at`, `duration_seconds`, `is_short`, link status, verification status, and link to recording/song.
2. Add a `youtube_watchlist` of videos collected daily, with `added_by`, `reason`, `active`, and source of discovery.
3. Discovery sources, cheapest first:
   - **Verified artist channels.** For every artist with a verified YouTube channel (already supported by the artist review workflow), read the channel's uploads playlist with `playlistItems.list` (1 unit). New uploads become **candidates**, not linked assets.
   - **Songs on the Apple chart.** For Apple chart songs without a YouTube asset, create a candidate-search task. Use `search.list` sparingly (100 units each), cap it per day in config, and only search channels already verified for that artist where possible.
   - **Manual entry** by a data editor (paste a video URL).
   - **mostPopular MN** results, if Phase A5 shows they exist.
4. Data-editor review screen under `/dashboard/catalog`: show candidate video, channel, verified-channel badge, duration, publish date, suggested song with confidence and reason. Actions: link, reject, mark kind, set as primary asset. Every action needs a reason and is audited. Reuse the existing match-review patterns (`entity_match_reviews`).
5. Matching rules: suggest only; auto-link **only** when the video comes from a verified channel of the credited artist **and** normalized titles match exactly (reuse Cyrillic/Latin normalization). Everything else needs review.

**Acceptance:** pgTAP tests for RLS (writers can't link), audit rows, and no duplicate video IDs. Unit tests for title normalization including Cyrillic/Latin pairs. A dashboard browser test links one fixture video.

## A3. Daily YouTube statistics collector

**Goal:** one reliable, evidence-backed statistics snapshot per business date for every active watchlist video and verified channel.

Tasks:
1. New collector module `src/modules/youtube/` (client, schema, normalize, collect) following `src/modules/apple-music/` structure. Prefer `videos.batchGetStats` if available on the project; fall back to `videos.list?part=statistics,contentDetails,status,snippet` in batches of 50.
2. Register a new pipeline job type `youtube_daily_stats`, scheduled per D6, with the same lease, retry, backoff and raw-payload retention as Apple. Idempotency key: `youtube:stats:<business_date>`.
3. Validation rules (store failures as anomalies, don't approve):
   - every requested ID answered, or explicitly missing (deleted/private) and recorded as such;
   - counts are non-negative integers;
   - a video's `viewCount` **lower** than its last approved value is an anomaly (`impossible_metric_movement`), not an approved fact;
   - payload checksum identical to the previous day for all videos is `payload_stale`.
4. Store per-video daily rows: `business_date`, `fetched_at` (UTC), `view_count`, `like_count`, `comment_count`, availability status, payload ID, retention class `youtube_statistics`.
5. Partial success is allowed (some videos missing) but must be visible in Data Health with counts.
6. Add the job to `/dashboard/data-health` and to `/api/internal/data-health`.
7. Store the methodology-break dates (2025-03-31 Shorts, 2026-08-27 all formats) in methodology configuration.

**Acceptance:** fixture tests for: normal batch, deleted video, private video, view count decrease, HTTP 403 quota error (retry later, not tight loop), 429, malformed JSON, stale payload. Integration test against local PostgREST in CI. Live check against the real API with the owner's key once D1 is done: record the job ID and counts.

## A4. YouTube calculations

**Goal:** turn raw counters into daily movement Atlas can rank and explain.

Tasks:
1. Per video: `views_gained` = today's views − last approved views. If the gap between observations isn't one day, store `interval_days` and mark the value **multi-day**. Never divide it into fake daily values for ranking.
2. Per song: sum `views_gained` across linked assets of the kinds allowed by D4, counting each video once. Keep a per-kind breakdown.
3. Per artist: sum across songs, counting a song once (mirror the Apple artist aggregation rule).
4. **Atlas YouTube Tracked Top 100**: songs ranked by single-day `views_gained`. Only songs with a clean one-day interval are eligible that day. Store as a separate chart (`charts` row, e.g. `youtube-tracked-mn`) with its own snapshots and methodology version. Label everywhere as a tracked-catalogue ranking of global views.
5. Reuse `calculateChart` style metrics where they make sense (rank change, peak, days on chart, streaks, momentum), versioned as a separate formula, e.g. `youtube-metrics-v1`.
6. Engagement ratios (likes per 1,000 views, comments per 1,000 views) as **derived metrics**, clearly labelled as Atlas calculations, never as YouTube data.
7. New-release tracking: for videos younger than 30 days, store views in first 24h, 72h, 7 days, and compare with the same artist's previous releases at the same age.

**Acceptance:** deterministic unit tests (shuffled input order gives identical output), tests for multi-day gaps, deleted videos mid-history, duplicate assets, and a video relinked to another song (recalculate from the earliest affected day, as the identity-correction flow already does for Apple).

## A5. mostPopular Mongolia probe (small, optional)

1. One-off script: call `videos.list?chart=mostPopular&regionCode=MN&videoCategoryId=10&maxResults=50` and without the category. Record what comes back (count, channels, whether it looks Mongolian).
2. If results are meaningful, add a daily `youtube_mostpopular_mn` snapshot as a **discovery feed** for A2 candidates and an editorial "on YouTube's trending music list" fact. Do **not** treat it as a ranking of Mongolian consumption.
3. Without a key, build the probe script and a fixture test only, and mark the live probe pending. If the live probe returns nothing relevant, record that in `docs/DECISIONS.md` and leave the feed switched off.

## A6. YouTube data-quality anomalies

Add to the anomaly engine (existing `anomaly_alerts`), each with severity, evidence and rule version:
- `yt_view_count_decrease` (counter went down)
- `yt_implausible_jump` (one-day gain above a configured share of lifetime views, e.g. a 7-year-old video gaining 40% in a day)
- `yt_video_unavailable` (deleted, private or region-blocked)
- `yt_asset_conflict` (one video linked to two songs, or a song's primary asset changed)
- `yt_stale_payload`
- `yt_partial_collection` (more than a configured share of watchlist missing)
- `yt_methodology_break` (informational, on the break dates)

**Acceptance:** each rule has a fixture that triggers it and one that doesn't.

## A7. YouTube in the dashboard and public site

1. Dashboard: YouTube tab in the chart explorer; YouTube panel on song and artist intelligence pages (daily views gained, rank on tracked chart, new-release curve); watchlist and coverage stats in Data Health.
2. Public site, **only if D3 = public**: YouTube panel on song/artist pages and a tracked-chart page with a clear MN/EN methodology note. Show YouTube attribution and link to each video. Show "as of" dates; never display a stored statistic as current when it's older than the last refresh.
3. API and CSV: add YouTube endpoints alongside the Apple ones in `src/app/api/v1/` and document them in `docs/API.md`. Respect retention: API never serves YouTube data older than the active window.

**Acceptance:** browser tests in both locales and both viewports; checks that no API response contains expired YouTube data.

## A8. Comment sentiment (positive / neutral / negative)

**Goal:** show how audiences react to a song on YouTube, as an aggregate. Example: "last 7 days: 71% positive, 22% neutral, 7% negative, based on 1,240 comments".

**Policy basis:** YouTube's [derived metrics policy](https://developers.google.com/youtube/terms/derived-metrics-policy) lists "viewer sentiment analysis" from aggregate data such as comment analysis as an acceptable derived metric. Accepted clients may keep derived metrics up to 36 months, but **comment text must be refreshed or deleted within 30 days**. The policy forbids inferring protected attributes (age, race, political leaning, health) of audiences or creators, and forbids framing that encourages harassment.

Tasks:
1. **Collector:** for active watchlist videos, fetch new top-level comments since the last run with `commentThreads.list` (`order=time`, 100 per page), with a configurable cap per video per day. Record when comments are disabled. Same job, lease, retry and evidence pattern as A3; job type `youtube_comments`.
2. **Store the minimum:** comment ID, video ID, publish time, text, language guess, retention class `youtube_metadata` (30-day deletion). **Do not store commenter names, channel IDs or avatars**; they aren't needed for aggregates.
3. **Classifier:** label each comment `positive`, `neutral`, `negative` or `spam_or_off_topic`, plus a confidence score. Comments mix Mongolian Cyrillic, Mongolian written in Latin letters ("hairtai", "goy"), English and emoji, and off-the-shelf sentiment tools handle Mongolian poorly. So use a large language model through a server-side API key (D10). Store model name, prompt version and label; never ask the model about the commenter as a person.
4. **Measure accuracy before showing anything:** editors hand-label a mixed sample (e.g. 300 comments). Record accuracy per label and per language. Show sentiment only if it meets the threshold set in D10, and repeat the check whenever the model or prompt changes.
5. **Aggregates kept long-term** (derived metrics, 36-month mode only): per video, song and artist per day and week, the positive / neutral / negative shares, comment count, spam share and classifier version. Per-comment text and labels are deleted with the 30-day job.
6. **Signals:**
   - `sentiment_shift`: negative share jumps above the song's baseline. This is a possible controversy, routed to editors for checking, never auto-published.
   - `strong_reception`: a new release's first-week positive share is well above the artist's usual level.
   - Both require a minimum comment count (e.g. 50) to fire.
7. **Display:**
   - Dashboard first: sentiment bars on song and artist intelligence pages, with "based on N comments", the time window and the classifier version. Editors may read recent comment text (within 30 days) to verify a signal.
   - Public pages (only if D10 allows): aggregate bars only. Never quote or name individual commenters.
8. **Caveats shown wherever sentiment appears:** commenters are a self-selected group, not all listeners; comments may come from outside Mongolia; bots and coordinated campaigns exist.

**Acceptance:** fixture tests for collection, disabled comments, the per-video cap and 30-day deletion; a stored accuracy report from the labelled sample; aggregate maths tests; signals don't fire below the minimum sample.

---

# Part B: Deeper intelligence

B1–B3 need only Apple data. B4 onwards needs Part A.

## B1. Command Center (spec §11.1)

The dashboard has sections for home, charts, signals, anomalies, stories, newsroom, catalog, artists and data health. First, audit the current home page against the spec checklist, then build what's missing.

Summary cards: current No. 1 and whether it changed; new entries; re-entries; highest new entry; biggest meaningful gainer; biggest faller; new career peaks; Mongolian songs in Top 100 and Top 10; artists with multiple entries; active anomalies; story leads awaiting review; collection status and source freshness (Apple and, after Part A, YouTube).

Modules: Today's Top 10; biggest movements; emerging songs; new entries and re-entries; **songs approaching Top 10**; **songs at risk of leaving**; artist momentum; local vs international share over time; important anomalies; prioritised story opportunities; collection health timeline.

**Acceptance:** every card links to its evidence; empty states are explicit before the first approved chart; MN/EN; mobile layout.

## B2. Complete the rule-based signal set (spec §9.1)

Already implemented in `src/modules/analytics/calculate.ts`: `new_number_one`, `highest_new_entry`, `new_entry`, `re_entry`, `new_peak`, `rank_jump_20` (and the matching fall), `three_day_gain_streak`, `artist_multi_entry`, `local_new_peak`.

Add, each with a version, configurable thresholds in `methodology_configuration`, a human-readable explanation built from stored facts, and tests:

| Signal | Suggested v1 rule |
|---|---|
| `threshold_crossing` | First-ever appearance inside Top 50 / 40 / 20 / 10 (one signal, the highest threshold crossed). |
| `fastest_climber` | Largest rise **weighted by position**, e.g. rise × (101 − rank) / 100, so 4→2 can beat 90→60. |
| `breakout` | Rank improved on ≥3 of the last 4 days and total gain ≥ X, starting outside Top 40. |
| `slow_burn` | 7-day average rank improves for ≥3 consecutive weeks with no single-day jump ≥ jump threshold. |
| `sudden_revival` | Song older than N days on chart, or returning after ≥14 days absent, climbs ≥ X. |
| `artist_takeover` | Artist holds ≥ K Top 20 places or ≥ M entries (extends `artist_multi_entry`). |
| `catalog_effect` | ≥2 older songs by an artist rise on the same day a new song by that artist enters. |
| `international_release_wave` | ≥3 tracks from one international album/project enter or rise together (needs album metadata; skip if missing and record why). |
| `resilience` | Rank stable (±2) for ≥7 days while median movement of its rank zone is falling. |
| `high_volatility` | 7-day rank standard deviation above a zone-specific threshold. |

**Acceptance:** fixture histories that trigger each signal and near-misses that don't. Dismissed signals stay in history.

## B3. Statistical baselines (spec §9.4), gated by history length

Only activate when there are **at least 30 approved daily snapshots**; before that, show "baseline building: N of 30 days".

1. Rolling 7-day and 30-day baselines per song and per rank zone (1–10, 11–40, 41–100).
2. Median absolute deviation outlier test for daily movement, per zone. Replace fixed thresholds with zone-aware ones where this tests better.
3. Expected-rank band per song (e.g. median ± k·MAD of recent ranks); "outside expected band" becomes a signal input.
4. Change-point detection for sustained trend shifts (simple CUSUM is enough for v1).
5. All statistical outputs are versioned and shown with their inputs; nothing is a black box.

**Acceptance:** unit tests with synthetic series (flat, trending, one spike, regime change).

## B4. Cross-platform intelligence (needs Part A)

1. **YouTube lead indicator:** a song's YouTube views gained jumps (vs its own 7-day baseline) before it enters or climbs the Apple chart. Store the lag in days. This becomes the **pre-chart buzz** signal.
2. **Cross-platform confirmation:** when an Apple signal and a YouTube signal fire for the same song within 3 days, raise confidence on both and link them.
3. **Divergence:** strong on one platform, flat or falling on the other. Signal type `platform_divergence`, editorial angle only, with no causal claim.
4. **New release radar:** new upload on a verified artist channel → track first 24h / 72h / 7-day views vs the artist's previous releases → `strong_release_start` signal.
5. **Catalog effect via YouTube:** older videos of an artist gain views after a new release.

**Acceptance:** fixture tests for each; explanations state facts only ("views gained rose from X to Y before the song entered the Apple chart at No. Z"). The spec's AI rule applies: never guess *why*.

## B5. Short-range projections

1. "Approaching Top 10" and "at risk of leaving the chart" from velocity, acceleration and the B3 baselines. Show as **projections** with the method version, never as facts.
2. **Backtest** every projection rule against stored history before it is shown; store hit rate. Hide rules with poor accuracy.

## B6. Signal-quality feedback loop

1. Per rule: count signals fired, confirmed, dismissed, converted to leads, published. Show precision per rule version.
2. Dashboard screen for administrators to review rule performance and propose threshold changes. Changes create a new methodology version; old signals keep their original version.
3. Use publication records (spec §10.4) to avoid repeating the same angle on the same song within a configurable window.

## B7. Richer Daily Atlas Brief

1. Add sections: YouTube movement (tracked catalogue), cross-platform items, new release radar, projections (labelled), data caveats (gaps, partial YouTube collection, methodology breaks).
2. Brief stays template-built from stored facts, in Mongolian first, every line linking to evidence IDs.
3. AI-drafted headlines and captions following spec §10.3 exactly: evidence IDs in the prompt, hypotheses labelled, model and prompt version stored, never auto-published. Build it behind a feature flag that is **off** by default, using `ANTHROPIC_API_KEY`.

## B8. Internal artist score (dashboard only)

Combine Apple chart points and YouTube tracked views into an **internal** artist momentum score for prioritising coverage. Versioned, labelled as an Atlas metric, never shown publicly as a chart. A public multi-source Atlas chart stays out of scope until the spec's governance requirements (§8.5) are met.

---

# Part C: Artist pages and music context

**What exists today:** a public artist page at `src/app/artists/[artistId]/page.tsx` with biography, verified profile links, source metrics, and chart stats (songs charted, charting days, peak, No. 1 days, Top 10 days, first and latest chart dates). Songs have one free-text `genre` column, filled from Apple's first non-"Music" genre name. There are no themes, moods or scene labels anywhere.

**Goal:** every artist has a rich page showing their statistics, the genres they work in, what their songs are about, and where they sit in the scene, with each label backed by evidence.

The key design idea is to describe music along **four separate dimensions**. Mixing them in one "genre" field makes the data useless. "Underground" is not a genre, and "love song" is not a style.

| Dimension | Answers | Level | Examples |
|---|---|---|---|
| **Genre** | What does it sound like? | Song (artist = summary) | Pop, hip-hop, rock, R&B, Hunnu rock / folk-metal, Mongolian traditional, folk-fusion, electronic, ballad |
| **Theme** | What is the song about? | Song (artist = summary) | Love, heartbreak, homeland / patriotism, nature and the steppe, parents and family, friendship, party and nightlife, ambition and hustle, social commentary, spiritual, nostalgia, humour |
| **Scene** | Where does the artist sit in the industry? | Artist | Underground, independent, mainstream / commercial, traditional ensemble |
| **Mood** (optional) | How does it feel? | Song | Upbeat, melancholic, aggressive, calm, romantic |

## C1. Music-context taxonomy and tagging

1. **Controlled vocabulary.** New tables for `context_dimensions` (genre, theme, scene, mood) and `context_terms` (slug, MN label, EN label, description, parent term for sub-genres, active flag). Taxonomy changes are versioned and audited. Seed with the D7 list.
2. **Tag assignments.** `song_context_tags` and `artist_context_tags` with: term, status (`suggested`, `verified`, `disputed`), source of the assignment, evidence (URL or note), assigned by, reviewed by, timestamps. Reuse the existing `verification_status` enum. Only **verified** tags appear publicly.
3. **Where tags come from**, in order of trust:
   - **Editor assessment**, with evidence (editor listened to the song; artist interview; label or press description).
   - **Source genres:** store *all* Apple `genreNames` (today only the first is kept), plus MusicBrainz genres/tags for artists. Map source genres to Atlas genre terms through a reviewed mapping table. Keep the original source values unchanged for provenance.
   - **AI suggestions (if D8 = yes):** from metadata Atlas is allowed to hold (title, credits, source genres, editor notes). Stored as `suggested` with model and prompt version; an editor confirms or rejects each one.
4. **Rules:**
   - **Never store song lyrics.** They are copyrighted. Editors may *read or listen* to decide a theme, but the database keeps only the tag and a short evidence note in the editor's own words.
   - YouTube video categories are YouTube's data. Atlas tags are Atlas's own and must be shown as such (YouTube's derived-metrics policy forbids presenting them as replacements for YouTube categories).
   - Tags describe **songs and music**, never artists' personal traits. Do not infer or store an artist's religion, ethnicity, politics or other protected attributes (a song can have a "spiritual" theme; the artist is not tagged as religious).
   - "Underground" and other scene labels are editorial judgments (D9). Require evidence, show a "how we classify" link, and give artists/labels a way to dispute (reuse the existing `disputed` status and review flow).
5. **Tagging screen** in `/dashboard/catalog` and `/dashboard/artists`: queue of untagged charting songs (most-charted first), quick tag pickers per dimension, bulk-accept of suggestions with per-tag review, and coverage stats ("72 of 100 current chart songs have a verified theme").
6. **Artist-level summaries** are calculated, not typed: an artist's genre and theme profile is the share of their verified-tagged songs per term, weighted optionally by chart days. Store as a versioned calculation.

**Acceptance:** pgTAP tests for RLS (writers can suggest, data editors/editors verify, public sees verified only), audit rows on every change, taxonomy versioning. Unit tests for the source-genre mapping and the artist profile calculation. Tagging screen browser test in both locales.

## C2. Artist page v2 (public) and artist intelligence page (dashboard)

Rebuild the public artist page. Sections, top to bottom:

1. **Header:** name (Mongolian Cyrillic plus Latin form), photo (only with recorded source and usage rights; otherwise initials, as today), short biography, verified links (Apple Music, YouTube, official site), scene label with a "how we classify" link.
2. **Key statistics:**
   - Apple Music: songs charted, total charting days, best peak, No. 1 days, Top 10 days, current songs on chart, current chart share.
   - YouTube (wired up in A7, and public only if D3 allows): views gained last 7 / 30 days on tracked videos, most-viewed tracked video, latest release start vs the artist's average. Show "as of" date; respect retention.
3. **Chart history:** rank-history chart of all the artist's songs over time (reuse `rank-history.tsx`), with milestone markers (first entry, first Top 10, No. 1s, career peaks) from stored signals.
4. **Sound and subject profile:** genre breakdown and theme breakdown as simple bars ("62% love songs, 25% homeland, 13% party"), mood if used. Each bar links to the songs behind it. Show "based on N tagged songs of M".
5. **Discography:** every known song with its genres, themes, peak, chart days and platform links; filters by genre and theme.
6. **Collaborations:** co-credited artists from `song_artists`, with shared songs.
7. **Atlas coverage:** published articles linked to this artist.
8. **Similar artists:** explainable overlap of genres and themes (show *why*, e.g. "also mostly hip-hop and hustle themes"). No black-box recommendations.
9. **Methodology note:** where each number comes from.

Dashboard artist intelligence page (spec §11.6) adds: all the above plus untagged songs, pending suggestions, open disputes, signals and leads for the artist, and YouTube watchlist coverage.

Apply the same structure to **song pages**: genre, themes, mood, scene of the artist, Apple and YouTube panels, and related songs by shared themes.

**Acceptance:** pages work with zero, partial and full data; "N of M songs tagged" is always visible; no unverified tag appears publicly; both locales and viewports; Open Graph image per artist.

## C3. Browse by genre, theme and scene

1. Public pages `/genres/[slug]`, `/themes/[slug]` and `/scenes/[slug]`: current chart songs with that tag, top artists, and history ("love songs on the chart this year").
2. Filters on the chart, archive and artist directory by genre, theme and scene.
3. Include them in `sitemap.ts`, search and the API (`/api/v1/...`).

The spec lists genre pages as a later phase (§12.1); this is that phase.

## C4. Context intelligence (needs C1 coverage and B3 baselines)

1. **Share over time:** share of the Top 100 (by entries and position-weighted points) per genre, theme and local/international, daily and weekly. Show on the Command Center.
2. **New signals:** `theme_surge` / `genre_surge` (a term's share rises beyond its baseline), `scene_crossover` (an artist tagged underground enters the Top 40 or Top 10), `artist_new_direction` (a new release has a genre or theme the artist hasn't used before).
3. **Seasonality** once a year of data exists: e.g. homeland themes around Naadam, family themes around Tsagaan Sar. Report as observed patterns only, never as forecasts.
4. **Daily brief** gains a short "what Mongolia is listening to" line built from these facts ("love songs hold 41 of the Top 100, up 6 this week").
5. Signals only fire when tag coverage of the chart is above a configured minimum (e.g. 80%); otherwise show "coverage too low to compare".

**Acceptance:** fixture tests for each signal, including the coverage gate.

---

# Dependency map

```
Phase 0 (repo) ─┬─> A1 retention ─> A2 catalogue ─> A3 collector ─> A4 calculations ─┬─> A6 anomalies ─> A7 surfaces ─> A8 comment sentiment
                │                                     └─> A5 probe (optional)        │
                │                                                                    └─> B4 cross-platform ─> B5 projections
                └─> B1 Command Center ─> B2 signals ─> B3 baselines ──────────────────────────────────────> B6 quality loop ─> B7 brief ─> B8 artist score
Phase 0 ──> C1 taxonomy and tagging ──> C2 artist and song pages ──> C3 browse pages
                    └──────────────── (with B3) ──> C4 context intelligence
```

# Execution order

Build in exactly this order, one phase at a time, committing and ticking `docs/PROGRESS.md` after each:

1. Phase 0: make the repository build and test
2. A1: YouTube retention and compliance model
3. B1: Command Center
4. C1: music-context taxonomy and tagging
5. A2: YouTube video catalogue and song linking
6. C2: artist page v2 and song pages
7. A3: daily YouTube statistics collector
8. B2: complete the rule-based signal set
9. A4: YouTube calculations
10. A5: mostPopular Mongolia probe
11. C3: browse by genre, theme and scene
12. B3: statistical baselines
13. A6: YouTube data-quality anomalies
14. A7: YouTube in the dashboard and public site
15. B4: cross-platform intelligence
16. C4: context intelligence
17. A8: comment sentiment
18. B5: short-range projections
19. B6: signal-quality feedback loop
20. B7: richer Daily Atlas Brief (include sentiment shifts and context lines)
21. B8: internal artist score
22. Z: final verification and handoff (below)

# Z. Final verification and handoff

1. Run every check that can run in this environment: lint, typecheck, unit tests, `db:types --check` if a database is available, production build, and database and browser suites if Docker and a browser are available.
2. Update `docs/VERIFICATION.md` with exact results and a list of everything **not** verified (live Apple, live YouTube, live sentiment, hosted database, seven-day observation).
3. Update `docs/API.md`, `docs/OPERATIONS.md` (YouTube collector, retention job, comment job, tagging workflow, sentiment accuracy check) and `docs/BACKLOG.md`.
4. Write `docs/HANDOFF.md` for the owner in plain language:
   - what was built;
   - which environment variables to set;
   - the exact hosted-database steps, **not run**: backup, `supabase db push --dry-run`, review, apply;
   - how to switch on the scheduler;
   - the outstanding external tasks: Apple Music token, YouTube derived-metrics application, email provider, seven-day staging observation.
5. Do **not** push migrations to any hosted Supabase project or deploy to production. Leave that to the owner.

# Definition of done for the whole plan

The build is done at Phase Z. The first two items below happen after the owner deploys, and `docs/HANDOFF.md` must explain them.


- Seven consecutive real days of YouTube collection in staging with no unexplained gaps, recorded with job and snapshot IDs.
- Retention job has run in staging and its audit records are visible.
- Every new signal has fired at least once on real or fixture data and been reviewed in the dashboard.
- Daily brief includes the new sections, in Mongolian, with evidence links.
- Every current chart song has a verified genre and theme (or is in the tagging queue), and every charting artist has a v2 page.
- `docs/VERIFICATION.md`, `docs/API.md`, `docs/OPERATIONS.md` (new YouTube runbook steps) and `docs/DECISIONS.md` are updated.

# Prompts

**Kickoff** (first session):

> Read `CLAUDE.md`, then `docs/BUILD_ORDER.md` and `docs/DECISIONS.md`. Build everything in `docs/BUILD_ORDER.md` from Phase 0 to Phase Z in the execution order, without stopping for approval between phases. Use the decisions in `docs/DECISIONS.md`. Track progress in `docs/PROGRESS.md` and commit after each phase. Only stop for the cases listed under "How to use this file".

**Resume** (if a session ends before Phase Z):

> Read `CLAUDE.md`, `docs/PROGRESS.md`, `docs/BUILD_ORDER.md` and `docs/DECISIONS.md`. Continue the autonomous build from the first unticked phase in `docs/PROGRESS.md`, following the same rules, until Phase Z is done.
