// Imports owner-approved artists and their songs from their own YouTube
// channels. Reads every upload (playlistItems, 1 unit per 50) and its details
// (videos.list, 1 unit per 50), keeps the songs (src/modules/youtube/artist-catalog.ts)
// and, with --apply, stores each artist through the audited database function
// `import_youtube_artist_catalog` with the raw API responses as evidence.
//
//   node node_modules/jiti/lib/jiti-cli.mjs scripts/import-youtube-artists.ts --manifest data/artists/youtube-hiphop-approved.json --env <file> [--apply]
//
// Without --apply it only writes a local snapshot under .local/. Never point
// --apply at a database without the owner's approval (CLAUDE.md).
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { createYouTubeClient, toCandidate, uploadsPlaylistId } from "../src/modules/youtube/discovery";
import { classifyUploads, type ImportArtist } from "../src/modules/youtube/artist-catalog";

const { values } = parseArgs({
  options: {
    manifest: { type: "string", default: "data/artists/youtube-hiphop-approved.json" },
    env: { type: "string", default: ".env.local" },
    out: { type: "string", default: ".local/youtube-artist-imports" },
    apply: { type: "boolean", default: false },
    only: { type: "string" },
  },
});

loadEnvFile(values.env);
const key = process.env.YOUTUBE_API_KEY;
if (!key) throw new Error("YOUTUBE_API_KEY is required.");
const manifest = JSON.parse(await readFile(values.manifest!, "utf8")) as { approval: string; artists: ImportArtist[] };
await mkdir(values.out!, { recursive: true });

const db = values.apply
  ? (() => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !service) throw new Error("--apply needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
      console.log(`Import target: ${new URL(url).host}`);
      return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    })()
  : null;

let units = 0;
const totals = { artists: 0, songs: 0, videos: 0, skipped: 0 };
for (const artist of manifest.artists) {
  if (values.only && !values.only.split(",").some((o) => o === artist.channelId || o === artist.name)) continue;
  const client = createYouTubeClient(key);
  const uploads = await client.allUploads(artist.channelId);
  const details = uploads.ids.length ? await client.videos(uploads.ids) : [];
  const candidates = details.flatMap((v) => {
    const c = toCandidate(v, new Set([artist.channelId]));
    return c ? [c] : [];
  });
  const { songs, skipped } = classifyUploads(artist, candidates);
  const rawBody = JSON.stringify({ responses: client.responses });
  const checksum = createHash("sha256").update(rawBody, "utf8").digest("hex");
  const sourceUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId(artist.channelId)}&pages=${client.responses.length}`;
  units += client.quotaUnits;
  const payload = { ...artist };
  await writeFile(`${values.out}/${artist.channelId}.json`, JSON.stringify({ artist: artist.name, uploads: uploads.ids.length, complete: uploads.complete, songs, skipped }, null, 2) + "\n");
  console.log(`${artist.name}: ${uploads.ids.length} uploads${uploads.complete ? "" : " (capped)"}, ${songs.length} songs, ${skipped.length} skipped, ${client.quotaUnits} units`);
  totals.artists += 1;
  totals.songs += songs.length;
  totals.videos += songs.reduce((n, s) => n + s.videos.length, 0);
  totals.skipped += skipped.length;
  if (db) {
    // Large channels go in batches so each call stays under the database's
    // statement timeout; every batch carries the same evidence.
    for (let i = 0; i < Math.max(songs.length, 1); i += 30) {
      const { data, error } = await db.rpc("import_youtube_artist_catalog", {
        p_reason: manifest.approval,
        p_source_url: sourceUrl,
        p_raw_body: rawBody,
        p_checksum: checksum,
        p_artist: { ...payload, songs: songs.slice(i, i + 30) },
      });
      if (error) throw new Error(`${artist.name}: ${error.message}`);
      console.log(`  stored: ${JSON.stringify(data)}`);
    }
  }
}
console.log(`Total: ${JSON.stringify(totals)}; ${units} YouTube quota units.${db ? "" : " Snapshot only; --apply writes to the database."}`);
