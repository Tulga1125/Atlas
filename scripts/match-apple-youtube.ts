// Owner rule (2026-11-17): every song on Apple Music is also on YouTube.
// For artists that have a verified YouTube channel, this script
//   1. matches each Apple song to the artist's YouTube song by normalised
//      title (same credited artist only) and merges them with the audited
//      catalog tool (Apple song kept as the canonical song);
//   2. for Apple songs with no match, searches YouTube (search.list, 100
//      units each) for an upload by the artist's channel or its
//      auto-generated "<artist> - Topic" channel with the same title, adds it
//      with source evidence and links it to the Apple song.
// Runs as a signed-in administrator (one-time link) so every change goes
// through the same functions and audit trail as the dashboard. Dry run
// unless --apply.
import { createHash } from "node:crypto";
import { loadEnvFile } from "node:process";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { matchKey, stripTitleNoise } from "../src/modules/catalog/match-title";
import { createYouTubeClient, toCandidate } from "../src/modules/youtube/discovery";

const { values } = parseArgs({ options: { env: { type: "string", default: ".env.local" }, apply: { type: "boolean", default: false }, admin: { type: "string" }, searches: { type: "string", default: "40" } } });
loadEnvFile(values.env);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, service = process.env.SUPABASE_SERVICE_ROLE_KEY!, ytKey = process.env.YOUTUBE_API_KEY!;
const svc = createClient(url, service, { auth: { persistSession: false } });
const YT = "00000000-0000-0000-0000-000000000002";
const REASON = "Owner rule, 2026-11-17: every Apple Music song is also on YouTube; matched by the same credited artist and the same normalised title.";
const key = (t: string) => matchKey(stripTitleNoise(t.replace(/\s*[([](?:feat|ft|with)\.?[^)\]]*[)\]]/giu, "")));

async function adminClient() {
  const link = await svc.auth.admin.generateLink({ type: "magiclink", email: values.admin! });
  if (link.error) throw link.error;
  const anon = createClient(url, service, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
  if (error || !data.session) throw error ?? new Error("no session");
  return createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? service, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${data.session.access_token}` } } });
}
const must = <T,>(r: { data: T; error: { message: string } | null }, what: string) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

const profiles = must(await svc.from("artist_platform_profiles").select("artist_id,platform_artist_id,artists!inner(canonical_name,redirect_to)").eq("platform_id", YT).eq("match_status", "verified"), "profiles");
const admin = values.apply ? await adminClient() : null;
const yt = createYouTubeClient(ytKey);
let searchesLeft = Number(values.searches);
const report = { merged: 0, linked: 0, unmatched: [] as string[] };

for (const p of profiles as unknown as { artist_id: string; platform_artist_id: string; artists: { canonical_name: string; redirect_to: string | null } }[]) {
  if (p.artists.redirect_to) continue;
  const credits = must(await svc.from("song_artists").select("song_id,songs!inner(id,canonical_title,source_key,redirect_to)").eq("artist_id", p.artist_id), "credits") as unknown as { songs: { id: string; canonical_title: string; source_key: string | null; redirect_to: string | null } }[];
  const songs = credits.map((c) => c.songs).filter((s) => !s.redirect_to);
  const apple = songs.filter((s) => s.source_key?.startsWith("apple_music:"));
  const youtube = songs.filter((s) => s.source_key?.startsWith("youtube:"));
  for (const a of apple) {
    const k = key(a.canonical_title);
    const match = k ? youtube.filter((y) => key(y.canonical_title) === k) : [];
    if (match.length === 1) {
      console.log(`merge  ${p.artists.canonical_name}: "${match[0].canonical_title}" (YouTube) → "${a.canonical_title}" (Apple)`);
      if (admin) {
        const preview = must(await admin.rpc("catalog_operation", { p_action: "merge", p_source: match[0].id, p_target: a.id, p_recordings: [], p_reason: REASON, p_preview: true }), "preview") as { fingerprint: string };
        must(await admin.rpc("catalog_operation", { p_action: "merge", p_source: match[0].id, p_target: a.id, p_recordings: [], p_reason: REASON, p_preview: false, p_fingerprint: preview.fingerprint }), "merge");
      }
      report.merged++;
      continue;
    }
    if (match.length > 1) { report.unmatched.push(`${p.artists.canonical_name} – ${a.canonical_title} (several YouTube songs)`); continue; }
    // No song on the channel: search YouTube for the artist's or its Topic channel's upload.
    if (searchesLeft-- <= 0) { report.unmatched.push(`${p.artists.canonical_name} – ${a.canonical_title} (search budget)`); continue; }
    const before = yt.responses.length;
    const ids = await yt.search(`${p.artists.canonical_name} ${a.canonical_title}`, null);
    const details = ids.length ? await yt.videos(ids) : [];
    const hit = details.map((v) => ({ v, c: toCandidate(v, new Set([p.platform_artist_id])) })).find(({ v, c }) => c && !c.isShort &&
      (v.snippet.channelId === p.platform_artist_id || (v.snippet.channelTitle ?? "") === `${p.artists.canonical_name} - Topic`) &&
      (key(v.snippet.title) === k || key(v.snippet.title).endsWith(k) && k.length >= 2));
    if (!hit) { report.unmatched.push(`${p.artists.canonical_name} – ${a.canonical_title} (not found)`); continue; }
    console.log(`link   ${p.artists.canonical_name}: "${hit.v.snippet.title}" [${hit.v.snippet.channelTitle}] → "${a.canonical_title}"`);
    if (admin) {
      const resp = yt.responses.slice(before);
      const raw = JSON.stringify({ responses: resp });
      const kind = (hit.v.snippet.channelTitle ?? "").endsWith(" - Topic") ? "official_audio" : hit.c!.suggestedKind;
      const profile = must(await admin.from("profiles").select("id").limit(1).single(), "profile") as { id: string };
      const added = must(await svc.rpc("record_manual_youtube_video", { p_actor: profile.id, p_reason: REASON, p_source_url: resp.at(-1)!.sourceUrl, p_http_status: 200, p_raw_body: raw, p_checksum: createHash("sha256").update(raw).digest("hex"), p_video: { ...hit.c!, suggestedKind: kind } }), "add video") as { assetId: string };
      const rec = must(await svc.from("recordings").select("id").eq("song_id", a.id).limit(1).single(), "recording") as { id: string };
      must(await admin.rpc("review_youtube_video", { p_asset: added.assetId, p_action: "link", p_reason: REASON, p_recording: rec.id, p_kind: kind }), "link");
    }
    report.linked++;
  }
}
console.log(JSON.stringify({ ...report, quotaUnits: yt.quotaUnits, applied: !!admin }, null, 2));
