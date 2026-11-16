// A4: YouTube calculations (youtube-metrics-v1). Pure and deterministic.
//
// * Per video: views gained since the last approved observation. When that
//   observation is not exactly one day earlier the value is multi-day and is
//   never split into invented daily values.
// * Per song: sum over verified links of the kinds that count (D4), each
//   video once, with a per-kind breakdown. Per artist: sum over songs, each
//   song once.
// * Tracked Top 100: songs ranked by single-day views gained. Only songs whose
//   every counted video had a clean one-day interval are eligible that day.
//   Labelled everywhere as global views of tracked videos, not Mongolia.
// * Engagement ratios are Atlas calculations, never YouTube data.

export const YOUTUBE_METRICS = "youtube-metrics-v1";
export const COUNTING_KINDS = ["official_music_video", "official_audio", "lyric_video"] as const;

export type StatRow = { assetId: string; date: string; views: number | null; likes: number | null; comments: number | null; approved: boolean };
export type VideoLink = { assetId: string; songId: string | null; kind: string | null; verified: boolean; publishedAt: string | null };

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const r2 = (v: number) => Math.round(v * 100) / 100;

export type VideoGain = { assetId: string; date: string; gained: number; intervalDays: number; multiDay: boolean };

/** Views gained per video per observed date, from approved rows only. */
export function videoGains(rows: StatRow[]): VideoGain[] {
  const byAsset = new Map<string, StatRow[]>();
  for (const r of rows) if (r.approved && r.views !== null) byAsset.set(r.assetId, [...(byAsset.get(r.assetId) ?? []), r]);
  const out: VideoGain[] = [];
  for (const [assetId, list] of [...byAsset].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < sorted.length; i++) {
      const interval = dayDiff(sorted[i - 1].date, sorted[i].date);
      out.push({ assetId, date: sorted[i].date, gained: sorted[i].views! - sorted[i - 1].views!, intervalDays: interval, multiDay: interval !== 1 });
    }
  }
  return out;
}

export type SongDay = {
  songId: string;
  date: string;
  gained: number;
  eligible: boolean;
  multiDay: boolean;
  intervalDays: number;
  byKind: Record<string, number>;
  videos: number;
};

/** Song totals over verified, counting links; one entry per video. */
export function songDays(gains: VideoGain[], links: VideoLink[]): SongDay[] {
  const link = new Map<string, VideoLink>();
  for (const l of [...links].sort((a, b) => a.assetId.localeCompare(b.assetId)))
    if (!link.has(l.assetId)) link.set(l.assetId, l); // duplicate asset rows count once
  const key = (songId: string, date: string) => `${songId}\u0000${date}`;
  const acc = new Map<string, SongDay>();
  for (const g of gains) {
    const l = link.get(g.assetId);
    if (!l?.songId || !l.verified || !l.kind || !(COUNTING_KINDS as readonly string[]).includes(l.kind)) continue;
    const k = key(l.songId, g.date);
    const day = acc.get(k) ?? { songId: l.songId, date: g.date, gained: 0, eligible: true, multiDay: false, intervalDays: 1, byKind: {}, videos: 0 };
    day.gained += g.gained;
    day.byKind[l.kind] = (day.byKind[l.kind] ?? 0) + g.gained;
    day.videos += 1;
    if (g.multiDay) {
      day.multiDay = true;
      day.eligible = false;
      day.intervalDays = Math.max(day.intervalDays, g.intervalDays);
    }
    if (g.gained < 0) day.eligible = false;
    acc.set(k, day);
  }
  return [...acc.values()].sort((a, b) => a.date.localeCompare(b.date) || a.songId.localeCompare(b.songId));
}

/** Artist totals: each song counted once per artist per day. */
export function artistDays(days: SongDay[], credits: { songId: string; artistId: string }[]) {
  const artists = new Map<string, Set<string>>();
  for (const c of credits) artists.set(c.songId, new Set([...(artists.get(c.songId) ?? []), c.artistId]));
  const acc = new Map<string, { artistId: string; date: string; gained: number; songs: number; multiDay: boolean }>();
  for (const d of days)
    for (const artistId of [...(artists.get(d.songId) ?? [])].sort()) {
      const k = `${artistId}\u0000${d.date}`;
      const a = acc.get(k) ?? { artistId, date: d.date, gained: 0, songs: 0, multiDay: false };
      a.gained += d.gained;
      a.songs += 1;
      a.multiDay ||= d.multiDay;
      acc.set(k, a);
    }
  return [...acc.values()].sort((a, b) => a.date.localeCompare(b.date) || a.artistId.localeCompare(b.artistId));
}

export type ChartEntry = {
  date: string;
  rank: number;
  songId: string;
  gained: number;
  previousRank: number | null;
  rankChange: number | null;
  peakRank: number;
  daysOnChart: number;
  streak: number;
  momentum: number;
};

/**
 * The tracked chart for every date in `dates` (ascending), each built from
 * eligible single-day gains. Ties break by song id. Metrics follow the Apple
 * chart's rules: rank change against the previous chart date, peak and
 * days on chart over the tracked history, streak of consecutive daily rises.
 */
export function trackedCharts(days: SongDay[], dates: string[], size = 100): ChartEntry[] {
  const out: ChartEntry[] = [];
  const peak = new Map<string, number>();
  const tenure = new Map<string, number>();
  const streak = new Map<string, number>();
  let previous = new Map<string, number>();
  let previousDate: string | null = null;
  for (const date of [...dates].sort()) {
    const ranked = days
      .filter((d) => d.date === date && d.eligible && d.gained > 0)
      .sort((a, b) => b.gained - a.gained || a.songId.localeCompare(b.songId))
      .slice(0, size);
    const current = new Map<string, number>();
    const consecutive = previousDate !== null && dayDiff(previousDate, date) === 1;
    ranked.forEach((d, i) => {
      const rank = i + 1;
      current.set(d.songId, rank);
      const prev = consecutive ? previous.get(d.songId) ?? null : null;
      const change = prev === null ? null : prev - rank;
      peak.set(d.songId, Math.min(peak.get(d.songId) ?? rank, rank));
      tenure.set(d.songId, (tenure.get(d.songId) ?? 0) + 1);
      streak.set(d.songId, change !== null && change > 0 ? (streak.get(d.songId) ?? 0) + 1 : 0);
      // Momentum 0–100: position 60%, today's rise 25%, streak 15% (capped at 25 places / 7 days).
      const momentum = r2(100 * (0.6 * ((size + 1 - rank) / size) + 0.25 * (Math.max(Math.min(change ?? 0, 25), 0) / 25) + 0.15 * (Math.min(streak.get(d.songId)!, 7) / 7)));
      out.push({ date, rank, songId: d.songId, gained: d.gained, previousRank: prev, rankChange: change, peakRank: peak.get(d.songId)!, daysOnChart: tenure.get(d.songId)!, streak: streak.get(d.songId)!, momentum });
    });
    previous = current;
    previousDate = date;
  }
  return out;
}

/** Likes and comments per 1,000 views on a date: Atlas calculations. */
export function engagement(rows: StatRow[], date: string) {
  return rows
    .filter((r) => r.date === date && r.approved && r.views)
    .map((r) => ({
      assetId: r.assetId,
      likesPerThousand: r.likes === null ? null : r2((r.likes / r.views!) * 1000),
      commentsPerThousand: r.comments === null ? null : r2((r.comments / r.views!) * 1000),
    }))
    .sort((a, b) => a.assetId.localeCompare(b.assetId));
}

/**
 * New-release starts for videos younger than 30 days: views at 1, 3 and 7
 * days after publication (the first observation on or after that age, with
 * its actual age), compared with the artist's earlier releases at the same age.
 */
export function releaseStarts(rows: StatRow[], links: VideoLink[], credits: { songId: string; artistId: string }[], today: string) {
  const ages = [1, 3, 7] as const;
  const artistOf = new Map<string, string[]>();
  for (const c of credits) artistOf.set(c.songId, [...(artistOf.get(c.songId) ?? []), c.artistId].sort());
  const at = (assetId: string, published: string, age: number) => {
    const target = new Date(Date.parse(published) + age * 86_400_000).toISOString().slice(0, 10);
    const row = rows.filter((r) => r.assetId === assetId && r.approved && r.views !== null && r.date >= target).sort((a, b) => a.date.localeCompare(b.date))[0];
    return row ? { views: row.views!, observedAgeDays: dayDiff(published.slice(0, 10), row.date) } : null;
  };
  const counted = links.filter((l) => l.verified && l.songId && l.publishedAt && l.kind && (COUNTING_KINDS as readonly string[]).includes(l.kind));
  const profiles = counted.map((l) => ({ link: l, start: Object.fromEntries(ages.map((a) => [a, at(l.assetId, l.publishedAt!, a)])) as Record<(typeof ages)[number], ReturnType<typeof at>> }));
  return profiles
    .filter((p) => dayDiff(p.link.publishedAt!.slice(0, 10), today) < 30)
    .map((p) => {
      const artists = artistOf.get(p.link.songId!) ?? [];
      const earlier = profiles.filter((o) => o.link.assetId !== p.link.assetId && o.link.publishedAt! < p.link.publishedAt! && (artistOf.get(o.link.songId!) ?? []).some((a) => artists.includes(a)));
      const average = (age: (typeof ages)[number]) => {
        const vals = earlier.map((o) => o.start[age]?.views).filter((v): v is number => v !== undefined);
        return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
      };
      return {
        assetId: p.link.assetId,
        songId: p.link.songId!,
        publishedAt: p.link.publishedAt!,
        start: p.start,
        artistAverage: { 1: average(1), 3: average(3), 7: average(7) },
        comparedReleases: earlier.length,
      };
    })
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.assetId.localeCompare(b.assetId));
}
