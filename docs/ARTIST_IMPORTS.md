# Real Mongolian artist directory

Artist discovery operates independently of the Apple Music chart collector. The directory can launch before an approved chart exists. Until then, the homepage introduces real artists, the chart page explains that collection is pending, and chart JSON/CSV endpoints return 404. Database/configuration failures still surface as errors.

The application has no demo data or demo authentication path. Unit and browser fixtures live in `tests/` and the guarded isolated test database on port 55321; they are never loaded by the public website.

## Discovery and import

Configure the public Supabase URL/key and the server-only service key in ignored `.env.local`. Apply all migrations first. The CLI prints the target hostname, never credentials.

```bash
# Read MusicBrainz; write a local snapshot without changing the database.
pnpm artists:discover --curated data/artists/curated-mongolian.json

# Replay that exact reviewed snapshot into the configured database.
pnpm artists:import --input .local/artist-imports/musicbrainz-mn.json
```

Without `--curated`, every new identity remains suggested with unknown locality. With that explicit option, only new identities in the source-checked manifest become verified/local. This is an audited bootstrap import, recorded as `curated_import` with no impersonated staff reviewer. Existing identities are never reverified, renamed or overwritten by an import; later corrections use the authenticated artist review desk.

MusicBrainz `country:MN` is a discovery hint, not nationality proof. Its search index also omits some artists whose city or lookup record establishes Mongolia, so the curated manifest supplies exact extra MBIDs to look up. Different artists with the same name stay separate. Artist aliases are retained for review; names never trigger automatic merging or Apple/YouTube linking.

Offset pagination can omit artists with tied search scores. Discovery partitions searches by disjoint MBID prefixes until each response fits within the API's 100-result limit, and checks totals and uniqueness before importing. Requests are sequential, spaced by at least 1.1 seconds, with bounded retry/backoff for transient HTTP failures. Keep only one discovery process running at a time.

The service-only `import_musicbrainz_artists` transaction retains the source records and curated evidence, creates source profiles/aliases, and writes an audit report. A checksum of the complete import envelope makes exact replays no-ops. Fresh imports preserve existing staff decisions. The returned run ID links the report, retained payload and audit records. No songs, chart snapshots, plays, subscribers or other audience measurements are generated.

Inspect pending identities in `/dashboard/artists`; an invited administrator or data editor can review evidence and exact platform IDs. Curated public profiles expose both MusicBrainz and their identity source. Newly imported photos remain absent until approved media is available.

## Starter evidence

The versioned [curated manifest](../data/artists/curated-mongolian.json) records the exact MBID, source, check date, original short biography and identity notes for:

- [The HU's official band biography](https://www.thehuofficial.com/band)
- [Magnolian's official website](https://www.magnolianmusic.com/)
- [The Lemons on MMusic](https://www.mmusic.mn/artist/2)
- [Nisvanis on MMusic](https://www.mmusic.mn/artist/4)
- [Mrs M on MMusic](https://www.mmusic.mn/artist/134)

These are brief factual summaries, not copied biographies or licensed photographs. The artist directory is not a complete census of Mongolian musicians. Extend coverage with checked artist/label websites, local catalogs and artist submissions.

[MusicBrainz's API documentation](https://musicbrainz.org/doc/MusicBrainz_API) requires an identifying User-Agent and at most one request per second, and distinguishes free noncommercial access from commercial service plans. Check the provider's commercial terms before enabling routine production discovery. This importer is an explicit command, not an unattended production crawler.

## Prepared discovery, 2026-09-06

The checked snapshot contains 203 unique country-search candidates plus three exact curated lookups: 206 identities total. Five are curated for publication and 201 require review. The import was validated against the isolated local test database, which was subsequently removed at the user's request to reclaim disk space. The hosted database migration and import have not been applied. The small discovery snapshot remains under ignored `.local/artist-imports/` for a future hosted import. Local import reports refer to the deleted test database. Re-run discovery to refresh these time-specific totals.

Apple Music and YouTube collection still require their own credentials and exact profile links. An imported identity does not imply a chart appearance, an audience metric, media usage rights or editorial approval of a news story.

## YouTube artist import, 2026-11-16

The owner approved 16 Mongolian hip-hop channels (`data/artists/youtube-hiphop-approved.json`, found by the search recorded in `youtube-hiphop-candidates.json`). `pnpm artists:youtube --env <file> [--apply]` reads every upload of each channel (48 quota units in total), keeps the songs (`src/modules/youtube/artist-catalog.ts`) and stores each artist through `import_youtube_artist_catalog` with the raw API responses as evidence. In this cloud container, run it with `NODE_USE_ENV_PROXY=1` so Node uses the HTTPS proxy.

Applied to the Railway database on 2026-11-16: 16 artists (verified, local, with the owner's approval recorded as evidence), 646 songs, 646 videos linked by construction and 28 more versions linked as suggestions for an editor. 219 uploads were skipped with a reason (Shorts, teasers, streams, and songs credited to another artist on the same channel). Songs exist only where the artist's own channel uploaded them; features on other channels are not included. Song titles come from video titles and can be corrected in the catalogue tools.
