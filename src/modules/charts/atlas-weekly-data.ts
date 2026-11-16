import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getAtlasBusinessDate } from "@/modules/collection/business-date";
import { getYouTubeWindow } from "@/modules/youtube/surface-data";
import {
  ATLAS_WEEKLY,
  addDays,
  computeWeeks,
  defaultWeeklyConfig,
  weekStartOf,
  weeklyConfigSchema,
  type AppleDay,
  type WeeklyChart,
  type YouTubeDay,
} from "./atlas-weekly";

// Loads the evidence for the Atlas Mongolia Top 50 and computes it. Weeks are
// limited to the YouTube retention window, so nothing outside it is used.
// Staff pages pass the signed-in client; a public page (only if the owner
// enables it) passes the server-only admin client.

type Db = SupabaseClient<Database>;
const PAGE = 1000;

async function all<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(`Weekly chart data unavailable: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

async function inChunks<T>(ids: string[], fetch: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await fetch(ids.slice(i, i + 200));
    if (error) throw new Error(`Weekly chart data unavailable: ${error.message}`);
    rows.push(...(data ?? []));
  }
  return rows;
}

export type WeeklySong = { title: string; artist: string; artistId: string | null };

export async function getAtlasWeekly(db: Db, today = getAtlasBusinessDate()) {
  const { start: windowStart, mode } = await getYouTubeWindow(db);
  const configRow = await db.from("methodology_configuration").select("parameters").eq("code", ATLAS_WEEKLY).maybeSingle();
  const config = configRow.data ? weeklyConfigSchema.parse(configRow.data.parameters) : defaultWeeklyConfig;
  // First whole week inside the window, through the running week.
  let first = weekStartOf(windowStart);
  if (first < windowStart) first = addDays(first, 7);
  const weekStarts: string[] = [];
  for (let w = first; w <= weekStartOf(today); w = addDays(w, 7)) weekStarts.push(w);
  if (weekStarts.length === 0) return { charts: [] as WeeklyChart[], songs: new Map<string, WeeklySong>(), windowStart, mode, config };

  const [snapshots, facts, daily] = await Promise.all([
    all((f, t) => db.from("chart_snapshots").select("snapshot_date").eq("status", "approved").gte("snapshot_date", first).order("snapshot_date").range(f, t)),
    all((f, t) => db.from("chart_facts").select("snapshot_date,song_id,rank").gte("snapshot_date", first).order("snapshot_date").order("rank").range(f, t)),
    all((f, t) => db.from("youtube_song_daily_current").select("song_id,business_date,views_gained,multi_day").gte("business_date", first).order("business_date").order("song_id").range(f, t)),
  ]);

  // Follow merges to the canonical song and artist, then keep Mongolian songs.
  const target = new Map<string, string>();
  const songRow = new Map<string, { title: string; locality: string; artistId: string | null }>();
  let pending = [...new Set([...facts.map((f) => f.song_id!), ...daily.map((d) => d.song_id!)])];
  while (pending.length) {
    const rows = await inChunks(pending, (c) => db.from("songs").select("id,redirect_to,canonical_title,locality,primary_artist_id").in("id", c));
    pending = [];
    for (const r of rows) {
      if (r.redirect_to) {
        target.set(r.id, r.redirect_to);
        if (!songRow.has(r.redirect_to) && !target.has(r.redirect_to)) pending.push(r.redirect_to);
      } else songRow.set(r.id, { title: r.canonical_title, locality: r.locality, artistId: r.primary_artist_id });
    }
  }
  const canonical = (id: string) => { let s = id; for (let i = 0; i < 10 && target.has(s); i++) s = target.get(s)!; return s; };

  const artistRow = new Map<string, { name: string; locality: string; redirect: string | null }>();
  let artistIds = [...new Set([...songRow.values()].map((s) => s.artistId).filter((a): a is string => !!a))];
  while (artistIds.length) {
    const rows = await inChunks(artistIds, (c) => db.from("artists").select("id,canonical_name,locality,redirect_to").in("id", c));
    artistIds = [];
    for (const r of rows) {
      artistRow.set(r.id, { name: r.canonical_name, locality: r.locality, redirect: r.redirect_to });
      if (r.redirect_to && !artistRow.has(r.redirect_to)) artistIds.push(r.redirect_to);
    }
  }
  const artistOf = (id: string | null) => { let a = id; for (let i = 0; i < 10 && a && artistRow.get(a)?.redirect; i++) a = artistRow.get(a)!.redirect; return a; };

  const songs = new Map<string, WeeklySong>();
  const mongolian = new Set<string>();
  for (const [id, s] of songRow) {
    const artistId = artistOf(s.artistId);
    const artist = artistId ? artistRow.get(artistId) : undefined;
    if (s.locality === "local" || artist?.locality === "local") mongolian.add(id);
    songs.set(id, { title: s.title, artist: artist?.name ?? "", artistId: artistId ?? null });
  }

  const apple: AppleDay[] = facts
    .map((f) => ({ date: f.snapshot_date!, songId: canonical(f.song_id!), rank: f.rank! }))
    .filter((f) => mongolian.has(f.songId));
  // A merged pair can appear twice on a day: keep its best rank once.
  const best = new Map<string, AppleDay>();
  for (const a of apple) { const k = `${a.date}|${a.songId}`; if (!best.has(k) || best.get(k)!.rank > a.rank) best.set(k, a); }
  const youtube: YouTubeDay[] = daily
    .filter((d) => d.business_date! >= windowStart)
    .map((d) => ({ date: d.business_date!, songId: canonical(d.song_id!), views: Number(d.views_gained ?? 0), multiDay: !!d.multi_day }))
    .filter((d) => mongolian.has(d.songId));

  const charts = computeWeeks(weekStarts, [...best.values()], [...new Set(snapshots.map((s) => s.snapshot_date))], youtube, today, config);
  return { charts, songs, windowStart, mode, config };
}
