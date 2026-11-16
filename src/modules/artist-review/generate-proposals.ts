import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { YouTubeSourceError, createYouTubeClient } from "@/modules/youtube/discovery";
import { indexArtists, matchCredit, pickChannel, type ChannelCandidate } from "./proposals";

// Drafts artist proposals for new names on the latest Apple chart. Runs daily
// after the Apple collection (and on demand from the queue page). Uses the
// server-only admin client; spends at most `channelSearchesPerRun` YouTube
// searches (100 units each; YouTube allows 100 searches a day per project).

type Db = SupabaseClient<Database>;

export async function generateArtistProposals(db: Db, youtubeKey: string | undefined) {
  const cfg = await db.from("methodology_configuration").select("parameters").eq("code", "artist-queue-v1").maybeSingle();
  const params = (cfg.data?.parameters ?? {}) as { channelSearchesPerRun?: number; minSubscribers?: number };
  let searches = params.channelSearchesPerRun ?? 8;
  const minSubscribers = params.minSubscribers ?? 1000;

  const latest = await db.from("chart_snapshots").select("snapshot_date").eq("status", "approved").order("snapshot_date", { ascending: false }).limit(1);
  if (latest.error) throw new Error(latest.error.message);
  const date = latest.data[0]?.snapshot_date;
  if (!date) return { date: null, proposed: 0, skipped: 0 };

  const facts = await db.from("chart_facts").select("song_id,rank,title,artist_id").eq("snapshot_date", date);
  if (facts.error) throw new Error(facts.error.message);
  const byArtist = new Map<string, { title: string; rank: number; songId: string }[]>();
  for (const f of facts.data) if (f.artist_id) byArtist.set(f.artist_id, [...(byArtist.get(f.artist_id) ?? []), { title: f.title!, rank: f.rank!, songId: f.song_id! }]);

  const [candidates, open, known] = await Promise.all([
    db.from("artists").select("id,canonical_name,locality,verification,redirect_to").in("id", [...byArtist.keys()]),
    db.from("artist_proposals").select("apple_artist_id").eq("status", "open"),
    db.from("artists").select("id,canonical_name,artist_aliases(alias)").eq("locality", "local").eq("verification", "verified").is("redirect_to", null),
  ]);
  if (candidates.error || open.error || known.error) throw new Error("Artist queue data unavailable");
  const waiting = new Set(open.data.map((o) => o.apple_artist_id));
  const index = indexArtists(known.data.map((a) => ({ id: a.id, names: [a.canonical_name, ...a.artist_aliases.map((x) => x.alias)] })));
  const youtube = youtubeKey ? createYouTubeClient(youtubeKey) : null;

  let proposed = 0, skipped = 0;
  for (const a of candidates.data) {
    // New, unreviewed Apple credits only.
    if (a.redirect_to || a.locality !== "unknown" || a.verification === "verified" || waiting.has(a.id)) continue;
    const songs = (byArtist.get(a.id) ?? []).sort((x, y) => x.rank - y.rank);
    const base = { appleName: a.canonical_name, chartDate: date, chartSongs: songs.map((s) => ({ title: s.title, rank: s.rank, songId: s.songId })) };
    const match = matchCredit(a.canonical_name, index);
    let row: { proposal: string; target: string | null; channel: string | null; co: string[]; evidence: Record<string, unknown> } | null = null;
    if (match.kind === "merge") {
      row = { proposal: "merge", target: match.target, channel: null, co: match.coArtists, evidence: { ...base, rule: "exact name or alias of a verified Mongolian artist", unresolved: match.unresolved } };
    } else if (youtube && searches > 0) {
      searches--;
      try {
        const ids = await youtube.searchChannels(match.parts[0]);
        const channels = await youtube.channels(ids);
        const full: ChannelCandidate[] = [];
        for (const c of channels) {
          const { ids: uploads } = c.videos > 0 ? await youtube.allUploads(c.channelId, 1) : { ids: [] as string[] };
          const details = uploads.length ? await youtube.videos(uploads) : [];
          full.push({ ...c, uploadTitles: details.map((v) => v.snippet.title) });
        }
        const pick = pickChannel(match.parts[0], songs.map((s) => s.title), full, minSubscribers);
        row = pick
          ? { proposal: "new_with_channel", target: null, channel: pick.channel.channelId, co: [], evidence: { ...base, rule: pick.confidence === "strong" ? "channel name matches and a chart song is in its uploads" : "channel name matches; no chart song found in its latest uploads", channel: { id: pick.channel.channelId, title: pick.channel.title, handle: pick.channel.handle, country: pick.channel.country, subscribers: pick.channel.subscribers, videos: pick.channel.videos }, matchedSongs: pick.matchedSongs, confidence: pick.confidence } }
          : { proposal: "review", target: null, channel: null, co: [], evidence: { ...base, rule: "no matching YouTube channel found", searched: full.map((c) => ({ title: c.title, subscribers: c.subscribers, country: c.country })) } };
      } catch (error) {
        if (error instanceof YouTubeSourceError && error.status === 429) { searches = 0; skipped++; continue; }
        throw error;
      }
    } else {
      skipped++;
      continue;
    }
    const { error } = await db.rpc("record_artist_proposal", { p_apple_artist: a.id, p_proposal: row.proposal, p_target: row.target as string, p_channel: row.channel as string, p_co_artists: row.co, p_evidence: row.evidence as never });
    if (error) throw new Error(error.message);
    proposed++;
  }
  return { date, proposed, skipped, quotaUnits: youtube?.quotaUnits ?? 0 };
}
