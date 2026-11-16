// Cleans song titles that came from YouTube upload titles (src/modules/catalog/clean-title.ts),
// through the audited review_song function as the administrator; the old
// title is kept as an alias. Lists uploads that are not songs for an editor.
// Dry run unless --apply.
import { writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { cleanSongTitle, looksLikeNotASong } from "../src/modules/catalog/clean-title";

const { values } = parseArgs({ options: { env: { type: "string" }, admin: { type: "string" }, apply: { type: "boolean", default: false }, out: { type: "string" } } });
loadEnvFile(values.env!);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const svc = createClient(url, service, { auth: { persistSession: false } });

type Row = { id: string; canonical_title: string; language: string | null; genre: string | null; locality: string; song_artists: { artists: { canonical_name: string; artist_aliases: { alias: string }[] } | null }[] };
const rows: Row[] = [];
for (let from = 0; ; from += 500) {
  const { data, error } = await svc.from("songs").select("id,canonical_title,language,genre,locality,song_artists(artists(canonical_name,artist_aliases(alias)))").like("source_key", "youtube:%").is("redirect_to", null).order("id").range(from, from + 499);
  if (error) throw error;
  rows.push(...(data as unknown as Row[]));
  if (data.length < 500) break;
}
const changes = rows.flatMap((r) => {
  const names = r.song_artists.flatMap((c) => (c.artists ? [c.artists.canonical_name, ...c.artists.artist_aliases.map((a) => a.alias)] : []));
  if (looksLikeNotASong(r.canonical_title)) return [];
  const clean = cleanSongTitle(r.canonical_title, names);
  return clean !== r.canonical_title ? [{ row: r, clean }] : [];
});
const notSongs = rows.filter((r) => looksLikeNotASong(r.canonical_title)).map((r) => ({ id: r.id, title: r.canonical_title }));
console.log(`${rows.length} YouTube songs; ${changes.length} titles to clean; ${notSongs.length} look like non-songs.`);
for (const c of changes) console.log(`  ${c.row.canonical_title}  →  ${c.clean}`);
if (values.out) await writeFile(values.out, JSON.stringify({ changes: changes.map((c) => ({ id: c.row.id, from: c.row.canonical_title, to: c.clean })), notSongs }, null, 2));

if (values.apply) {
  const link = await svc.auth.admin.generateLink({ type: "magiclink", email: values.admin! });
  if (link.error) throw link.error;
  const { data: s, error: e } = await createClient(url, service, { auth: { persistSession: false } }).auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
  if (e || !s.session) throw e ?? new Error("no session");
  const admin = createClient(url, service, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } });
  let done = 0;
  for (const c of changes) {
    const { error } = await admin.rpc("review_song", {
      p_song: c.row.id, p_title: c.clean, p_language: c.row.language ?? "", p_genre: c.row.genre ?? "",
      p_locality: c.row.locality as never, p_alias: c.row.canonical_title.slice(0, 240),
      p_reason: "Owner, 2026-11-17: song names were broken. Title cleaned of upload notes (clean-title v1); the old title is kept as an alias.",
    });
    if (error) throw new Error(`${c.row.canonical_title}: ${error.message}`);
    done++;
  }
  console.log(`renamed ${done}`);
}
