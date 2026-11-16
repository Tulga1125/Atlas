# Atlas API v1

Public JSON uses `{ "apiVersion": "1", "data": ... }`. Errors use `{ "error": "invalid_request | not_found | data_unavailable" }` with HTTP 400, 404 or 503. Dates are `YYYY-MM-DD` in Asia/Ulaanbaatar. Public successful responses cache for 60 seconds. Source ranks are not stream counts.

| GET endpoint                                                                | Behavior                                                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/api/v1/charts`                                                            | Supported chart registry                                                                                     |
| `/api/v1/charts/apple-music-mongolia/latest?date=YYYY-MM-DD`                | Latest or exact approved snapshot; includes source provenance, formula version and calculation-pending state |
| `/api/v1/charts/apple-music-mongolia/history?before=YYYY-MM-DD`             | Up to 50 dates, newest first; `nextCursor` supplies the next `before` value                                  |
| `/api/v1/charts/apple-music-mongolia/compare?from=YYYY-MM-DD&to=YYYY-MM-DD` | Canonical-song entries, exits, ranks and changes between two approved dates                                  |
| `/api/v1/charts/apple-music-mongolia/movers?date=YYYY-MM-DD`                | Known rank changes sorted by absolute movement                                                               |
| `/api/v1/songs/{uuid}`                                                      | Persistent catalog identity, aliases, source assets and observed history; `redirectTo` identifies merged IDs |
| `/api/v1/artists/{uuid}`                                                    | Verified local artist, source-backed metrics and credited chart discography                                  |
| `/api/v1/articles?cursor=...`                                               | 20 published articles, newest first; opaque `nextCursor`                                                     |
| `/api/v1/articles/{uuid}`                                                   | Published MN and optional reviewed EN content, facts and timestamp                                           |
| `/api/v1/search?q=...&cursor={uuid}`                                        | Song/verified-local-artist name and alias search; query 2–80 characters, up to 50 results                    |

Song histories are currently complete observed series; consumers should cache them. Chart and article archives use cursors. Unknown/off-chart values are null. Weekly navigation groups daily charts and does not imply an official weekly aggregate. Existing `/api/public/charts/apple-music-mongolia/latest` and `.csv` exports remain available. CSV neutralizes spreadsheet formulas in text cells without changing numeric ranks.

Private operations:

| Endpoint                                 | Authorization               | Behavior                                                 |
| ---------------------------------------- | --------------------------- | -------------------------------------------------------- |
| `POST /api/internal/collect/apple-music` | Cron bearer                 | Enqueue today's collection, HTTP 202 with job ID         |
| `POST /api/internal/worker`              | Cron bearer                 | Claim and execute one due job, or report idle            |
| `GET /api/internal/jobs?id={uuid}`       | Active staff session        | Private job status                                       |
| `GET /api/internal/data-health`          | Active staff or cron bearer | 200 healthy / 503 degraded; unauthenticated calls denied |

Staff mutations use server actions and role-gated database RPCs. Public clients cannot invoke collection/calculation completion functions or write workflow tables directly. Drafts, raw attempts, reviews and audit logs are private; RLS is enforced independently of page routing.


## Genres, themes and scenes (C3)

Atlas's own verified editorial tags; unverified tags never appear. `?locale=mn` returns Mongolian labels (default English).

- `GET /api/v1/genres`, `/api/v1/themes`, `/api/v1/scenes`: each term with the number of tagged songs and how many are on today's chart.
- `GET /api/v1/genres/{slug}` (and `themes`, `scenes`): today's chart songs with the tag, top artists by chart days, and the number of tagged songs on each approved chart over the last year. 404 for an unknown or inactive term.

## YouTube (A7)

Owner decision D3 keeps YouTube dashboard-only: these endpoints answer **signed-in staff only** (session cookie) and return `404` to everyone else, unless the server sets `ATLAS_YOUTUBE_PUBLIC=true`. Responses carry `"source": "YouTube"`. Every read is bounded by the active YouTube retention window (30 days, or 36 months in the derived-metrics mode): a date before the window returns `404 {"error":"expired"}`, and no response contains statistics dated before `windowStart`, even before the daily purge has run.

| Endpoint | Returns |
|---|---|
| `GET /api/v1/youtube/tracked-chart[?date=YYYY-MM-DD]` | Atlas YouTube Tracked Top 100 for the date (default: latest in the window): rank, previous rank, change, views gained, peak, days, streak, momentum, title, artist. Views are worldwide YouTube views of tracked Mongolian-market videos, not Mongolia's YouTube consumption. |
| `GET /api/v1/youtube/tracked-chart.csv[?date=]` | The same as CSV, with a `source` column. Cells are escaped against spreadsheet formula injection. |
| `GET /api/v1/youtube/songs/{songId}` | Daily views gained (series), last 7 / 30 days, current tracked rank, new-release start curve (day 1/3/7 vs the artist's earlier releases) and linked videos with their latest views. Video titles are omitted once purged (30-day metadata rule). |
| `GET /api/v1/youtube/artists/{artistId}` | Views gained last 7 / 30 days, most-viewed tracked video, latest release start. |

Staff responses are `Cache-Control: private, no-store`.
