import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createYouTubeClient, toCandidate, uploadsPlaylistId } from "@/modules/youtube/discovery";
import { classifyUploads } from "@/modules/youtube/artist-catalog";
import { looseKey, splitCredit } from "./proposals";

// Carries out an approved proposal through the existing audited functions:
// merge_artist and catalog_operation run as the signed-in administrator
// (`user`); the channel import runs with the server-only admin client because
// import_youtube_artist_catalog is a service function.

type Db = SupabaseClient<Database>;
export type Proposal = Database["public"]["Tables"]["artist_proposals"]["Row"];
type Evidence = { appleName: string; chartSongs: { title: string; songId: string }[] };

function check<T>(r: { data: T; error: { message: string } | null }, what: string) {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

/** Joins the Apple songs with the artist's YouTube songs of the same title. */
async function joinSongs(user: Db, admin: Db, artistId: string, reason: string) {
  const credits = check(await admin.from("song_artists").select("song_id,songs!inner(id,canonical_title,source_key,redirect_to)").eq("artist_id", artistId), "credits") as unknown as { songs: { id: string; canonical_title: string; source_key: string | null; redirect_to: string | null } }[];
  const songs = credits.map((c) => c.songs).filter((s) => !s.redirect_to);
  const youtube = songs.filter((s) => s.source_key?.startsWith("youtube:"));
  let joined = 0;
  for (const a of songs.filter((s) => s.source_key?.startsWith("apple_music:"))) {
    const k = looseKey(a.canonical_title);
    const same = youtube.filter((y) => looseKey(y.canonical_title) === k);
    if (!k || same.length !== 1) continue;
    const args = { p_action: "merge", p_source: same[0].id, p_target: a.id, p_recordings: [] as string[], p_reason: reason };
    const preview = check(await user.rpc("catalog_operation", { ...args, p_preview: true }), "preview") as { fingerprint: string };
    check(await user.rpc("catalog_operation", { ...args, p_preview: false, p_fingerprint: preview.fingerprint }), "merge songs");
    joined++;
  }
  return joined;
}

export async function carryOut(user: Db, admin: Db, p: Proposal, decision: "merge" | "new_with_channel" | "international", reviewer: string, chosenChannel?: string) {
  const sources = [p.apple_artist_id, ...p.also_apple_artist_ids];
  const evidence = p.evidence as unknown as Evidence;
  const reason = `Approved by ${reviewer} in the artist approval queue (${p.rule_version}): ${evidence.appleName}`;
  const result: Record<string, unknown> = { decision };

  if (decision === "merge") {
    if (!p.target_artist_id) throw new Error("No target artist");
    for (const src of sources) check(await user.rpc("merge_artist", { p_source: src, p_target: p.target_artist_id, p_reason: reason }), "merge");
    for (const co of p.co_artist_ids)
      for (const s of evidence.chartSongs)
        check(await user.rpc("add_song_credit", { p_song: s.songId, p_artist: co, p_role: "primary", p_reason: reason }), "co-credit");
    result.songsJoined = await joinSongs(user, admin, p.target_artist_id, reason);
    result.artistId = p.target_artist_id;
  } else if (decision === "new_with_channel") {
    const channelId = chosenChannel ?? p.channel_id;
    if (!channelId) throw new Error("No channel");
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) throw new Error("YOUTUBE_API_KEY is not configured");
    const yt = createYouTubeClient(key);
    const { ids } = await yt.allUploads(channelId, 20);
    const videos = ids.length ? await yt.videos(ids) : [];
    const candidates = videos.flatMap((v) => { const c = toCandidate(v, new Set([channelId])); return c ? [c] : []; });
    const name = splitCredit(evidence.appleName)[0] ?? evidence.appleName;
    const artist = { name, channelId: channelId, aliases: [] as string[], isLabel: false };
    const { songs } = classifyUploads(artist, candidates);
    const raw = JSON.stringify({ responses: yt.responses });
    const checksum = createHash("sha256").update(raw, "utf8").digest("hex");
    let artistId: string | null = null;
    for (let i = 0; i < Math.max(songs.length, 1); i += 30) {
      const data = check(await admin.rpc("import_youtube_artist_catalog", {
        p_reason: reason,
        p_source_url: `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId(channelId)}&pages=${yt.responses.length}`,
        p_raw_body: raw,
        p_checksum: checksum,
        p_artist: { ...artist, songs: songs.slice(i, i + 30) } as never,
      }), "import") as { artistId?: string };
      artistId ??= data.artistId ?? null;
    }
    if (!artistId) throw new Error("Import returned no artist");
    for (const src of sources) check(await user.rpc("merge_artist", { p_source: src, p_target: artistId, p_reason: reason }), "merge");
    result.artistId = artistId;
    result.songsImported = songs.length;
    result.songsJoined = await joinSongs(user, admin, artistId, reason);
  } else {
    for (const src of sources) {
      const a = check(await admin.from("artists").select("canonical_name,artist_type").eq("id", src).single(), "artist")!;
      check(await user.rpc("review_artist_identity", {
        p_artist_id: src, p_canonical_name: a.canonical_name, p_artist_type: a.artist_type, p_country_code: null as unknown as string,
        p_locality: "international", p_verification: "verified", p_evidence_type: "manual",
        p_evidence_notes: `${reason}. Atlas lists Mongolian artists only; chart history kept.`,
      }), "mark international");
    }
  }
  check(await user.rpc("decide_artist_proposal", { p_id: p.id, p_decision: decision, p_note: JSON.stringify(result) }), "decide");
  return result;
}
