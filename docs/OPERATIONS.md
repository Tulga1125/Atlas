# Atlas operating runbook

## Daily ownership

Data editor checks Data Health at 06:30 Ulaanbaatar and resolves reviewed payloads using retained source evidence. Editor reviews the daily brief and prioritizes story leads. Engineering investigates infrastructure failure. A named backup operator and an independent monitor are required before launch.

A healthy day has today's approved 100-entry snapshot and a completed daily brief by 07:00. Before that deadline, the previous approved chart remains available. This is a freshness commitment, not a claim that Apple's chart changes at a fixed hour.

## Collector or worker failure

1. Open `/dashboard/data-health` with an active data editor/admin account. Inspect the job, each attempt's status/checksum/raw response, and review history. For an unreachable app/database, use provider status and database/cron logs.
2. For 429/5xx or transport errors, let the bounded retry schedule run. The worker retains evidence; it does not replace the approved chart on validation failure. Leases expire after 90 seconds and stale completion tokens are rejected.
3. For malformed/incomplete source data, repair the parser or resolve upstream access before retrying. A repeated checksum from an earlier day requires a documented freshness review tied to that payload. Never approve incomplete or invented ranks.
4. If the business date has passed, retain the gap. The current Apple response cannot backfill yesterday. A failed calculation can be replayed from already-approved historical facts without calling Apple.
5. After repair, use Review and Retry with a substantive reason. Confirm job completion, metrics, brief, API freshness and independent monitor recovery. Successful work invalidates public chart cache; normal cache lifetime is 60 seconds.

Review `cron.job_run_details` for scheduling failures and `net._http_response` for HTTP execution failures. A successful cron statement means an HTTP request was queued, not that the worker completed. The application job record is the completion authority. An external monitor must detect both bad responses and missing observations.

## Identity and source correction

Data editors review song metadata and aliases using official source IDs/evidence. Administrators preview merge/split impact, confirm the source/destination/recordings, add a reason and apply. Changed records invalidate the preview. Splits move a proper subset into another canonical song; create that song first when necessary. The source snapshot and collected IDs remain unchanged; `chart_facts` resolves current canonical mapping.

Undo is allowed only while the affected catalog state still matches the recorded result. Later corrections require a fresh reviewed operation. Recalculate from the earliest affected day, inspect new signals, and verify published factual claims separately. Existing articles and reviewed leads are preserved for editorial review; recalculation never silently rewrites published text.

A source revision is allowed only for today's approved snapshot. It creates a new approved snapshot connected by `revision_of` and marks the predecessor replaced within one transaction. Historical corrections require valid historical evidence and a separately reviewed ingestion change; the public source API cannot supply them automatically.

## Publishing

Editor verifies evidence and assigns an active writer/editor. The assignee saves the Mongolian draft and optional complete English translation, then submits. An editor approves the exact saved revision. Publication copies that approved content and supporting facts to an immutable record. External publication requires an HTTP(S) URL. A stale tab must reload before submitting another action.

Archive closes the lead's workflow; the historical publication stays publicly addressable. Material published corrections need a new reviewed article with a clear correction notice. There is no silent edit/delete path for published evidence.

## Release and rollback

1. Finish CI and staging acceptance. Generate types after schema changes with `pnpm db:types`. Review SQL, RLS changes, source contract and environment diffs.
2. Back up the hosted database and confirm a recoverable copy. Review `supabase db push --dry-run` against the intended linked project, then apply only the approved release migrations. These instructions do not automatically link or mutate any cloud project.
3. Deploy the corresponding application with real data configuration. Check authenticated health, public chart/API, both locales, callback URL and editorial access.
4. To stop collection, run `supabase/operations/pause-schedule.sql`. Public approved data remains readable.
5. Roll back the application to the last verified compatible deployment. Prefer a forward database repair; do not drop immutable history or reverse additive migrations blindly. Keep workers paused until schema/application compatibility is verified.
6. Resume the reviewed schedule and observe one collection plus calculation. Retain deployment, snapshot/run IDs and incident notes.

## Secrets, retention and recovery

Rotate the Apple developer token before expiry. Rotate `CRON_SECRET` in both the application and Vault, verify authenticated worker requests, and then revoke the previous value. Service role credentials belong only on the server. Supabase public keys are constrained by RLS and are not service credentials.

Retain chart snapshots, source provenance, correction records and publications for the life of the product. Set a reviewed retention policy for failed response bodies and operational logs based on volume. The only job that deletes evidence is the YouTube retention job below. Monitor database size and backup size weekly while source retention grows.

### YouTube retention job

YouTube's terms limit how long API data may be kept, so YouTube data is the one exception to permanent retention. Every source row carries a `retention_class`: `permanent` (Apple Music, Atlas facts), `youtube_statistics` (counts and Atlas metrics derived from them) or `youtube_metadata` (titles, descriptions, channel names, thumbnails and raw YouTube responses). The database assigns the class on insert.

- **Schedule:** `atlas-youtube-retention` enqueues a `youtube_retention` pipeline job at 05:00 Asia/Ulaanbaatar (21:00 UTC), before the 05:30 YouTube collection. The normal queue worker runs it.
- **What it does:** raw YouTube responses older than 30 days become tombstones (checksum, fetch time and `deleted under YouTube retention policy` remain; content is removed); YouTube statistics older than the active window are deleted; cached channel names, descriptions and images on verified YouTube profiles are stripped after 30 days without a refresh. Apple Music and editorial rows are refused by a database guard even if the job is misused.
- **Evidence:** each run writes a `retention_runs` row (mode, cutoffs, counts) and an audit row; each non-empty batch writes a `youtube_retention_purge` audit row with counts and date range, never content. Signals that cited a purged payload still resolve to its tombstone.
- **Mode:** `30_day` until the YouTube derived-metrics amendment is accepted (D2). An administrator switches with `select public.set_youtube_retention_mode('36_month', '<reason>')`; this creates a new methodology version and configuration row and is audited. Metadata stays on the 30-day clock in both modes. Update `docs/DECISIONS.md` at the same time.
- **Check:** `select * from retention_runs order by business_date desc limit 7;` should show one run per day. A missing day means the scheduler or worker did not run; enqueue it with `select public.enqueue_youtube_retention();`.

The local restore command verifies a complete logical dump inside the isolated test cluster and compares ten core table hashes. Hosted recovery is a separate launch gate: restore to another project, preserve or reconfigure encryption/Vault secrets, verify Auth and RLS, restore external object assets if introduced, point staging at it, and record elapsed time and newest recovered business date. Do not use the production project as a restore-test target.

Supabase documents [Vault-backed scheduled HTTP calls](https://supabase.com/docs/guides/functions/schedule-functions) and [hosted CLI backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Follow the provider's current encryption and restore requirements for the selected hosting tier.
