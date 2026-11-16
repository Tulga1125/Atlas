import { z } from "zod";

// Atlas Mongolia Top 50 (weekly), formula `atlas-mn-weekly-v1`.
// Mongolian artists only. One week = Monday to Sunday, Ulaanbaatar time.
//
//   Apple score A   = sum over the week's charted days of (101 − Apple rank)
//                     ÷ (100 × number of Apple charts collected that week)
//                     → 1.0 means No. 1 every day; 0 means never charted.
//   YouTube score Y = the song's YouTube views gained that week
//                     ÷ the most views gained by any Mongolian song that week
//                     → 1.0 for the week's most-watched Mongolian song.
//   Score           = 0.6 × A + 0.4 × Y (weights are configuration).
//
// Ties: higher A, then more views, then song ID (deterministic). A week is
// "final" once it is over and has at least 5 Apple charts and 5 YouTube
// collection days; the running week is "provisional"; anything thinner is
// "insufficient" and should not be published.
//
// YouTube views are worldwide (not Mongolia-only) and count official videos
// only (owner decision D4). The chart is computed from stored evidence, never
// stored itself, so it can only cover weeks inside the YouTube retention window.

export const ATLAS_WEEKLY = "atlas-mn-weekly-v1";

export const weeklyConfigSchema = z.object({
  size: z.number().int().positive().default(50),
  appleWeight: z.number().min(0).max(1).default(0.6),
  youtubeWeight: z.number().min(0).max(1).default(0.4),
  minAppleDays: z.number().int().min(1).max(7).default(5),
  minYouTubeDays: z.number().int().min(1).max(7).default(5),
});
export type WeeklyConfig = z.infer<typeof weeklyConfigSchema>;
export const defaultWeeklyConfig = weeklyConfigSchema.parse({});

export type AppleDay = { date: string; songId: string; rank: number };
export type YouTubeDay = { date: string; songId: string; views: number; multiDay: boolean };

export type WeeklyEntry = {
  rank: number;
  songId: string;
  score: number;
  apple: { score: number; points: number; days: number; bestRank: number | null };
  youtube: { score: number; views: number; includesGap: boolean };
  previousRank: number | null;
  change: number | null;
  peak: number;
  weeksOnChart: number;
  status: "new" | "re_entry" | "up" | "down" | "same";
};

export type WeeklyChart = {
  formula: string;
  weekStart: string;
  weekEnd: string;
  status: "final" | "provisional" | "insufficient";
  appleDays: number;
  youtubeDays: number;
  topViews: number;
  entries: WeeklyEntry[];
};

const DAY = 86_400_000;
export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}
/** Monday of the week that contains `date`. */
export function weekStartOf(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -(day === 0 ? 6 : day - 1));
}
const round = (v: number, places = 4) => Math.round(v * 10 ** places) / 10 ** places;

/**
 * One week's chart. `apple` and `youtube` must already be limited to
 * Mongolian songs; `appleChartDates` lists every approved Apple chart date
 * (any song) so a missing day is not mistaken for a song dropping out.
 */
export function computeWeek(
  weekStart: string,
  apple: AppleDay[],
  appleChartDates: string[],
  youtube: YouTubeDay[],
  today: string,
  config: WeeklyConfig = defaultWeeklyConfig,
): Omit<WeeklyChart, "entries"> & { entries: Omit<WeeklyEntry, "previousRank" | "change" | "peak" | "weeksOnChart" | "status">[] } {
  const weekEnd = addDays(weekStart, 6);
  const inWeek = (d: string) => d >= weekStart && d <= weekEnd;
  const appleDates = new Set(appleChartDates.filter(inWeek));
  const yt = youtube.filter((r) => inWeek(r.date));
  const youtubeDays = new Set(yt.map((r) => r.date)).size;

  const songs = new Map<string, { points: number; days: number; best: number | null; views: number; gap: boolean }>();
  const get = (id: string) => songs.get(id) ?? songs.set(id, { points: 0, days: 0, best: null, views: 0, gap: false }).get(id)!;
  for (const r of apple) {
    if (!appleDates.has(r.date)) continue;
    const s = get(r.songId);
    s.points += 101 - r.rank;
    s.days += 1;
    s.best = s.best === null ? r.rank : Math.min(s.best, r.rank);
  }
  for (const r of yt) {
    const s = get(r.songId);
    s.views += Math.max(0, r.views);
    s.gap ||= r.multiDay;
  }
  const topViews = Math.max(0, ...[...songs.values()].map((s) => s.views));
  const scored = [...songs.entries()]
    .map(([songId, s]) => {
      const a = appleDates.size ? s.points / (100 * appleDates.size) : 0;
      const y = topViews ? s.views / topViews : 0;
      return { songId, a, y, s, score: config.appleWeight * a + config.youtubeWeight * y };
    })
    .filter((x) => x.score > 0)
    .sort((p, q) => q.score - p.score || q.a - p.a || q.s.views - p.s.views || p.songId.localeCompare(q.songId))
    .slice(0, config.size);

  const over = weekEnd < today;
  const enough = appleDates.size >= config.minAppleDays && youtubeDays >= config.minYouTubeDays;
  return {
    formula: ATLAS_WEEKLY,
    weekStart,
    weekEnd,
    status: !over ? "provisional" : enough ? "final" : "insufficient",
    appleDays: appleDates.size,
    youtubeDays,
    topViews,
    entries: scored.map((x, i) => ({
      rank: i + 1,
      songId: x.songId,
      score: round(x.score),
      apple: { score: round(x.a), points: x.s.points, days: x.s.days, bestRank: x.s.best },
      youtube: { score: round(x.y), views: x.s.views, includesGap: x.s.gap },
    })),
  };
}

/** Consecutive weeks oldest first, with movement, peak and weeks on chart. */
export function computeWeeks(
  weekStarts: string[],
  apple: AppleDay[],
  appleChartDates: string[],
  youtube: YouTubeDay[],
  today: string,
  config: WeeklyConfig = defaultWeeklyConfig,
): WeeklyChart[] {
  const charts: WeeklyChart[] = [];
  const history = new Map<string, { peak: number; weeks: number }>();
  let previous = new Map<string, number>();
  for (const start of [...weekStarts].sort()) {
    const week = computeWeek(start, apple, appleChartDates, youtube, today, config);
    const counted = week.status !== "insufficient";
    const entries: WeeklyEntry[] = week.entries.map((e) => {
      const h = history.get(e.songId);
      const prev = previous.get(e.songId) ?? null;
      return {
        ...e,
        previousRank: prev,
        change: prev === null ? null : prev - e.rank,
        peak: Math.min(e.rank, h?.peak ?? e.rank),
        weeksOnChart: (h?.weeks ?? 0) + 1,
        status: prev === null ? (h ? "re_entry" : "new") : prev > e.rank ? "up" : prev < e.rank ? "down" : "same",
      };
    });
    if (counted) {
      for (const e of entries) history.set(e.songId, { peak: e.peak, weeks: e.weeksOnChart });
      previous = new Map(entries.map((e) => [e.songId, e.rank]));
    }
    charts.push({ ...week, entries });
  }
  return charts;
}
