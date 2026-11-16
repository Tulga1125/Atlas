import { retentionCutoffs, type RetentionConfig } from "./retention";

// A7: what the dashboard (and, only if D3 becomes public, the site and API)
// shows from YouTube. Pure helpers: the window rule, summaries and CSV.
// Rule: nothing dated before the active retention window is ever returned,
// even if the retention job has not run yet today.

export const YOUTUBE_ATTRIBUTION = "YouTube";

/** First business date inside the active YouTube statistics window. */
export function windowStart(config: Pick<RetentionConfig, "mode">, now: Date) {
  return retentionCutoffs(config.mode, now).statisticsCutoff;
}

export function inWindow<T extends { business_date: string }>(rows: T[], start: string) {
  return rows.filter((r) => r.business_date >= start);
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type DailyRow = { business_date: string; views_gained: number; multi_day: boolean };
export type TrackedRow = {
  business_date: string;
  rank: number;
  song_id: string;
  views_gained: number;
  previous_rank: number | null;
  rank_change: number | null;
  peak_rank: number;
  days_on_chart: number;
  streak: number;
  momentum: number;
};

/**
 * Views gained over the last `days` days up to `asOf`. A multi-day value
 * (a collection gap) is counted whole only when it lies inside the period,
 * and flagged, because it is never split across days.
 */
export function viewsGained(rows: DailyRow[], asOf: string, days: number) {
  const from = addDays(asOf, -days + 1);
  const inside = rows.filter((r) => r.business_date >= from && r.business_date <= asOf);
  return {
    views: inside.reduce((sum, r) => sum + Number(r.views_gained), 0),
    days: new Set(inside.map((r) => r.business_date)).size,
    includesGap: inside.some((r) => r.multi_day),
  };
}

export type ReleaseStart = {
  start: Record<string, { views: number; observedAgeDays: number } | null>;
  artistAverage: Record<string, number | null>;
  comparedReleases: number;
  publishedAt: string;
};

/** Day-1/3/7 views of a release against the artist's earlier releases. */
export function releaseCurve(start: ReleaseStart | null) {
  if (!start) return null;
  return {
    publishedAt: start.publishedAt,
    comparedReleases: start.comparedReleases,
    points: (["1", "3", "7"] as const).map((age) => {
      const own = start.start[age];
      const average = start.artistAverage[age] ?? null;
      return {
        age: Number(age),
        views: own?.views ?? null,
        observedAgeDays: own?.observedAgeDays ?? null,
        artistAverage: average,
        vsAverage: own && average ? Math.round((own.views / average) * 100) / 100 : null,
      };
    }),
  };
}

export function songYouTubeSummary(input: { daily: DailyRow[]; chart: TrackedRow[]; start: string; release: ReleaseStart | null }) {
  const daily = inWindow(input.daily, input.start).sort((a, b) => a.business_date.localeCompare(b.business_date));
  const chart = inWindow(input.chart, input.start).sort((a, b) => a.business_date.localeCompare(b.business_date));
  const asOf = daily.at(-1)?.business_date ?? null;
  const latest = chart.at(-1) ?? null;
  return {
    asOf,
    windowStart: input.start,
    last7: asOf ? viewsGained(daily, asOf, 7) : null,
    last30: asOf ? viewsGained(daily, asOf, 30) : null,
    series: daily.map((d) => ({ date: d.business_date, views: Number(d.views_gained), gap: d.multi_day })),
    rank: latest && latest.business_date === asOf ? { rank: latest.rank, change: latest.rank_change, peak: Math.min(...chart.map((c) => c.peak_rank)), daysOnChart: latest.days_on_chart } : null,
    rankHistory: chart.map((c) => ({ date: c.business_date, rank: c.rank })),
    release: releaseCurve(input.release),
  };
}

export type VideoViews = { assetId: string; videoId: string; title: string | null; songId: string | null; views: number; date: string };

export function artistYouTubeSummary(input: { daily: DailyRow[]; videos: VideoViews[]; releases: (ReleaseStart & { songId: string })[]; start: string }) {
  const daily = inWindow(input.daily, input.start).sort((a, b) => a.business_date.localeCompare(b.business_date));
  const asOf = daily.at(-1)?.business_date ?? null;
  const videos = input.videos.filter((v) => v.date >= input.start);
  const top = [...videos].sort((a, b) => b.views - a.views || a.videoId.localeCompare(b.videoId))[0] ?? null;
  const latest = [...input.releases].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0] ?? null;
  return {
    asOf,
    windowStart: input.start,
    last7: asOf ? viewsGained(daily, asOf, 7) : null,
    last30: asOf ? viewsGained(daily, asOf, 30) : null,
    mostViewed: top,
    latestRelease: latest ? { songId: latest.songId, ...releaseCurve(latest)! } : null,
  };
}

export type Coverage = {
  artistsWithChannel: number;
  linkedVerified: number;
  linkedSuggested: number;
  candidates: number;
  watched: number;
  collectedOnLatest: number;
  latestDate: string | null;
};

export function coverageShare(c: Coverage) {
  return c.watched ? Math.round((c.collectedOnLatest / c.watched) * 1000) / 10 : null;
}

function csvCell(value: unknown) {
  const s = value === null || value === undefined ? "" : String(value);
  // Spreadsheet formula injection: prefix risky leading characters.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function trackedChartCsv(rows: (TrackedRow & { title: string; artist: string })[]) {
  const header = ["date", "rank", "previous_rank", "rank_change", "title", "artist", "views_gained", "peak_rank", "days_on_chart", "streak", "momentum", "source"];
  const lines = [...rows]
    .sort((a, b) => a.business_date.localeCompare(b.business_date) || a.rank - b.rank)
    .map((r) => [r.business_date, r.rank, r.previous_rank, r.rank_change, r.title, r.artist, r.views_gained, r.peak_rank, r.days_on_chart, r.streak, r.momentum, YOUTUBE_ATTRIBUTION].map(csvCell).join(","));
  return [header.join(","), ...lines].join("\n") + "\n";
}

export type SongVideoViews = { songId: string | null; kind: string | null; verification: string; views: number | null; asOf: string | null };
const COUNTING = new Set(["official_music_video", "official_audio", "lyric_video"]);

/**
 * Total YouTube views per song (latest collected count, official videos only
 * per owner decision D4, each video once) and the artist's grand total.
 */
export function songViewTotals(videos: SongVideoViews[], titles: Map<string, string>) {
  const bySong = new Map<string, { views: number; videos: number }>();
  let asOf: string | null = null;
  for (const v of videos) {
    if (!v.songId || v.views === null || v.verification !== "verified" || !COUNTING.has(v.kind ?? "")) continue;
    const s = bySong.get(v.songId) ?? { views: 0, videos: 0 };
    s.views += v.views;
    s.videos += 1;
    bySong.set(v.songId, s);
    if (v.asOf && (!asOf || v.asOf > asOf)) asOf = v.asOf;
  }
  const songs = [...bySong.entries()]
    .map(([songId, s]) => ({ songId, title: titles.get(songId) ?? songId, ...s }))
    .sort((a, b) => b.views - a.views || a.title.localeCompare(b.title));
  return { songs, total: songs.reduce((n, s) => n + s.views, 0), asOf };
}
