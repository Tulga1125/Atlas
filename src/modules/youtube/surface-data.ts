import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { retentionConfigSchema } from "./retention";
import {
  artistYouTubeSummary,
  songViewTotals,
  songYouTubeSummary,
  windowStart,
  type Coverage,
  type DailyRow,
  type ReleaseStart,
  type TrackedRow,
  type VideoViews,
} from "./surfaces";

// A7 reads. Every query is bounded below by the active retention window, so
// expired YouTube data is never returned even before the purge job runs.
// Staff pages pass the signed-in client (RLS: staff only); a public route may
// pass the server-only admin client, and only when D3 allows it.

type Db = SupabaseClient<Database>;
const YOUTUBE = "00000000-0000-0000-0000-000000000002";

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`${what} unavailable${error ? `: ${error.message}` : ""}`);
}

export async function getYouTubeWindow(db: Db, now = new Date()) {
  const { data, error } = await db.rpc("youtube_retention_config");
  if (error) fail("YouTube retention", error);
  const config = retentionConfigSchema.parse(data);
  return { start: windowStart(config, now), mode: config.mode };
}

const numberOr0 = (v: number | null) => Number(v ?? 0);

function trackedRows(rows: Database["public"]["Views"]["youtube_tracked_chart"]["Row"][]): TrackedRow[] {
  return rows.map((r) => ({
    business_date: r.business_date!,
    rank: r.rank!,
    song_id: r.song_id!,
    views_gained: numberOr0(r.views_gained),
    previous_rank: r.previous_rank,
    rank_change: r.rank_change,
    peak_rank: r.peak_rank!,
    days_on_chart: r.days_on_chart!,
    streak: r.streak!,
    momentum: numberOr0(r.momentum),
  }));
}

async function latestRunId(db: Db) {
  const { data, error } = await db.from("youtube_calculation_runs").select("id").order("created_at", { ascending: false }).limit(1);
  if (error) fail("YouTube calculations", error);
  return data[0]?.id ?? null;
}

/** The tracked chart for one date (default: the latest date in the window). */
export async function getTrackedChart(db: Db, date?: string) {
  const { start } = await getYouTubeWindow(db);
  let target = date ?? null;
  if (!target) {
    const latest = await db.from("youtube_tracked_chart").select("business_date").gte("business_date", start).order("business_date", { ascending: false }).limit(1);
    if (latest.error) fail("YouTube chart", latest.error);
    target = latest.data[0]?.business_date ?? null;
  }
  if (!target || target < start) return { date: target, windowStart: start, expired: !!target && target < start, entries: [] };
  const rows = await db.from("youtube_tracked_chart").select("*").eq("business_date", target).order("rank");
  if (rows.error) fail("YouTube chart", rows.error);
  const entries = trackedRows(rows.data);
  const songs = entries.length
    ? await db.from("songs").select("id,canonical_title,primary_artist_id,artists!songs_primary_artist_id_fkey(canonical_name)").in("id", entries.map((e) => e.song_id))
    : { data: [], error: null };
  if (songs.error) fail("Songs", songs.error);
  const song = new Map(songs.data.map((s) => [s.id, s]));
  return {
    date: target,
    windowStart: start,
    expired: false,
    entries: entries.map((e) => ({
      ...e,
      title: song.get(e.song_id)?.canonical_title ?? "",
      artist: song.get(e.song_id)?.artists?.canonical_name ?? "",
      artistId: song.get(e.song_id)?.primary_artist_id ?? null,
    })),
  };
}

/** Tracked-chart dates available inside the window, newest first. */
export async function getTrackedDates(db: Db) {
  const { start } = await getYouTubeWindow(db);
  const { data, error } = await db.from("youtube_tracked_chart").select("business_date").gte("business_date", start).eq("rank", 1).order("business_date", { ascending: false }).limit(400);
  if (error) fail("YouTube chart", error);
  return data.map((r) => r.business_date!);
}

async function releaseStarts(db: Db, songIds: string[]) {
  const run = await latestRunId(db);
  if (!run || songIds.length === 0) return [];
  const { data, error } = await db.from("youtube_release_starts").select("song_id,published_at,start,artist_average,compared_releases").eq("run_id", run).in("song_id", songIds);
  if (error) fail("YouTube release starts", error);
  return data.map((r) => ({
    songId: r.song_id,
    publishedAt: r.published_at,
    start: r.start as ReleaseStart["start"],
    artistAverage: r.artist_average as ReleaseStart["artistAverage"],
    comparedReleases: r.compared_releases,
  }));
}

export async function getSongYouTube(db: Db, songId: string) {
  const { start } = await getYouTubeWindow(db);
  const [daily, chart, videos, releases] = await Promise.all([
    db.from("youtube_song_daily_current").select("business_date,views_gained,multi_day").eq("song_id", songId).gte("business_date", start).order("business_date"),
    db.from("youtube_tracked_chart").select("*").eq("song_id", songId).gte("business_date", start).order("business_date"),
    songVideos(db, [songId]),
    releaseStarts(db, [songId]),
  ]);
  if (daily.error) fail("YouTube daily", daily.error);
  if (chart.error) fail("YouTube chart", chart.error);
  const release = releases.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0] ?? null;
  return {
    summary: songYouTubeSummary({ daily: daily.data as DailyRow[], chart: trackedRows(chart.data), start, release }),
    videos: await withLatestViews(db, videos, start),
  };
}

type LinkedVideo = { assetId: string; videoId: string; title: string | null; songId: string | null; kind: string | null; verification: string; isPrimary: boolean; ownChannel: boolean };

async function songVideos(db: Db, songIds: string[]): Promise<LinkedVideo[]> {
  if (songIds.length === 0) return [];
  const recordings = await db.from("recordings").select("id,song_id").in("song_id", songIds);
  if (recordings.error) fail("Recordings", recordings.error);
  const songOf = new Map(recordings.data.map((r) => [r.id, r.song_id]));
  if (songOf.size === 0) return [];
  const assets = await db
    .from("platform_assets")
    .select("id,recording_id,platform_title,youtube_video_assets!youtube_video_assets_platform_asset_id_fkey(video_id,channel_id,link_method,asset_kind,link_status,verification,is_primary,metadata_purged_at)")
    .eq("platform_id", YOUTUBE)
    .in("recording_id", [...songOf.keys()]);
  if (assets.error) fail("YouTube videos", assets.error);
  const profiles = await db.from("artist_platform_profiles").select("platform_artist_id").eq("platform_id", YOUTUBE).eq("match_status", "verified");
  if (profiles.error) fail("YouTube channels", profiles.error);
  const ownChannels = new Set(profiles.data.map((p) => p.platform_artist_id));
  return assets.data.flatMap((a) => {
    const y = Array.isArray(a.youtube_video_assets) ? a.youtube_video_assets[0] : a.youtube_video_assets;
    if (!y || y.link_status !== "linked") return [];
    return [{
      assetId: a.id,
      videoId: y.video_id,
      // Titles are YouTube metadata: hidden once the retention job purged them.
      title: y.metadata_purged_at ? null : a.platform_title,
      songId: songOf.get(a.recording_id ?? "") ?? null,
      kind: y.asset_kind,
      verification: y.verification,
      isPrimary: y.is_primary,
      ownChannel: y.link_method === "source_import" || ownChannels.has(y.channel_id),
    }];
  });
}

async function withLatestViews(db: Db, videos: LinkedVideo[], start: string) {
  if (videos.length === 0) return [];
  const { data, error } = await db
    .from("youtube_video_statistics")
    .select("platform_asset_id,business_date,view_count")
    .in("platform_asset_id", videos.map((v) => v.assetId))
    .eq("status", "approved")
    .gte("business_date", start)
    .order("business_date", { ascending: false })
    .limit(videos.length * 3);
  if (error) fail("YouTube statistics", error);
  const latest = new Map<string, { date: string; views: number }>();
  for (const r of data) if (!latest.has(r.platform_asset_id) && r.view_count !== null) latest.set(r.platform_asset_id, { date: r.business_date, views: Number(r.view_count) });
  return videos.map((v) => ({ ...v, views: latest.get(v.assetId)?.views ?? null, asOf: latest.get(v.assetId)?.date ?? null }));
}

export async function getArtistYouTube(db: Db, artistId: string) {
  const { start } = await getYouTubeWindow(db);
  const credits = await db.from("song_artists").select("song_id").eq("artist_id", artistId);
  if (credits.error) fail("Credits", credits.error);
  const songIds = [...new Set(credits.data.map((c) => c.song_id))];
  const [daily, videos, releases] = await Promise.all([
    db.from("youtube_artist_daily_current").select("business_date,views_gained,multi_day").eq("artist_id", artistId).gte("business_date", start).order("business_date"),
    songVideos(db, songIds),
    releaseStarts(db, songIds),
  ]);
  if (daily.error) fail("YouTube daily", daily.error);
  const withViews = await withLatestViews(db, videos.filter((v) => v.verification === "verified"), start);
  const viewed = withViews.flatMap((v): VideoViews[] => (v.views === null || !v.asOf ? [] : [{ assetId: v.assetId, videoId: v.videoId, title: v.title, songId: v.songId, views: v.views, date: v.asOf }]));
  // Song titles for the per-song totals (Atlas data, not YouTube metadata).
  const titled = songIds.length ? await db.from("songs").select("id,canonical_title").in("id", songIds) : { data: [], error: null };
  if (titled.error) fail("Songs", titled.error);
  return {
    summary: artistYouTubeSummary({ daily: daily.data as DailyRow[], videos: viewed, releases, start }),
    totals: songViewTotals(withViews, new Map((titled.data ?? []).map((t) => [t.id, t.canonical_title]))),
    linkedVideos: videos.length,
  };
}

export async function getYouTubeCoverage(db: Db): Promise<Coverage & { windowStart: string }> {
  const { start } = await getYouTubeWindow(db);
  const count = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
    const { count: c, error } = await q;
    if (error) fail("YouTube coverage", error);
    return c ?? 0;
  };
  const latest = await db.from("youtube_video_statistics").select("business_date").gte("business_date", start).order("business_date", { ascending: false }).limit(1);
  if (latest.error) fail("YouTube coverage", latest.error);
  const latestDate = latest.data[0]?.business_date ?? null;
  const head = { count: "exact" as const, head: true };
  const [artistsWithChannel, linkedVerified, linkedSuggested, candidates, watched, collectedOnLatest] = await Promise.all([
    count(db.from("artist_platform_profiles").select("id", head).eq("platform_id", YOUTUBE).eq("match_status", "verified")),
    count(db.from("youtube_video_assets").select("platform_asset_id", head).eq("link_status", "linked").eq("verification", "verified")),
    count(db.from("youtube_video_assets").select("platform_asset_id", head).eq("link_status", "linked").neq("verification", "verified")),
    count(db.from("youtube_video_assets").select("platform_asset_id", head).eq("link_status", "candidate")),
    count(db.from("youtube_watchlist").select("platform_asset_id", head).eq("active", true)),
    latestDate
      ? count(db.from("youtube_video_statistics").select("id", head).eq("business_date", latestDate).eq("availability", "available"))
      : Promise.resolve(0),
  ]);
  return { artistsWithChannel, linkedVerified, linkedSuggested, candidates, watched, collectedOnLatest, latestDate, windowStart: start };
}
