// Command Center (B1, spec §11.1). Pure functions: every card and module is
// computed from stored, approved facts, carries a link to its evidence, and
// is explicit when there is nothing to show. Transparent rules only, versioned.

import type { ChartEntry, ChartSnapshot } from "@/modules/charts/types";

export const COMMAND_CENTER_VERSION = "command-center-v1";

/** One song's position on one approved chart date. */
export type HistoryRow = {
  date: string;
  songId: string;
  rank: number;
  isLocal: boolean;
  artist: string;
};

export type JobRow = {
  id: string;
  kind: string;
  businessDate: string;
  status: string;
  errorCode: string | null;
};

export type Card = {
  key: string;
  value: string | number | null;
  detail: string | null;
  href: string;
  tone?: "alert" | "good" | "neutral";
};

export type SongItem = {
  songId: string;
  title: string;
  artist: string;
  rank: number;
  change: number | null;
  note?: string;
  href: string;
};

export type ArtistMomentum = {
  artist: string;
  entries: number;
  topTwenty: number;
  netChange: number;
  bestRank: number;
};

export type ShareRow = { date: string; top100: number; top10: number; href: string };

export type HealthDay = {
  date: string;
  status: "succeeded" | "failed" | "review" | "running" | "queued" | "missing";
  jobId: string | null;
  href: string;
};

export type CommandCenter = {
  version: string;
  hasChart: boolean;
  chartDate: string | null;
  cards: Card[];
  topTen: SongItem[];
  gainers: SongItem[];
  fallers: SongItem[];
  emerging: SongItem[];
  newAndReEntries: SongItem[];
  approachingTopTen: SongItem[];
  atRisk: SongItem[];
  artistMomentum: ArtistMomentum[];
  localShare: ShareRow[];
  health: HealthDay[];
};

const songHref = (id: string) => `/songs/${id}`;
const chartHref = (date: string) => `/charts/apple-music-mongolia?date=${date}`;
const bySongThenRank = (a: { rank: number; songId: string }, b: { rank: number; songId: string }) =>
  a.rank - b.rank || a.songId.localeCompare(b.songId);

function item(entry: ChartEntry, note?: string): SongItem {
  return {
    songId: entry.songId,
    title: entry.title,
    artist: entry.artist,
    rank: entry.rank,
    change: entry.rankChange,
    note,
    href: songHref(entry.songId),
  };
}

/**
 * A rise near the top matters more: places gained as a share of the previous
 * rank, so 4→2 (0.50) beats 90→60 (0.33). BUILD_ORDER's example formula,
 * rise × (101 − rank) / 100, ranks 90→60 first (12.3 vs 1.98), so it does not
 * meet its own stated goal; this proportional form does.
 */
export function weightedRise(entry: Pick<ChartEntry, "rank" | "rankChange" | "previousRank">) {
  const rise = Math.max(entry.rankChange ?? 0, 0);
  const from = entry.previousRank ?? entry.rank + rise;
  return from > 0 ? rise / from : 0;
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Ranks of each song on the most recent approved dates, newest first. */
function trajectories(history: HistoryRow[]) {
  const dates = [...new Set(history.map((r) => r.date))].sort().reverse();
  const bySong = new Map<string, Map<string, number>>();
  for (const row of history) {
    if (!bySong.has(row.songId)) bySong.set(row.songId, new Map());
    bySong.get(row.songId)!.set(row.date, row.rank);
  }
  return { dates, bySong };
}

/**
 * Watch-list rules (command-center-v1). Not projections: B5 replaces them
 * with backtested projections. Each needs consecutive approved dates; a gap
 * in the archive never counts as movement.
 *
 * Approaching Top 10: now at 11–25 and improved on each of the last 3
 * consecutive approved days.
 * At risk of leaving: now at 85–100 and fell on each of the last 2
 * consecutive approved days.
 */
export function watchLists(snapshot: ChartSnapshot, history: HistoryRow[]) {
  const { dates, bySong } = trajectories(history);
  const consecutive = (n: number) => {
    const run = dates.slice(0, n + 1);
    if (run.length < n + 1 || run[0] !== snapshot.date) return null;
    for (let i = 1; i < run.length; i++) if (addDays(run[i], 1) !== run[i - 1]) return null;
    return run;
  };
  const improving = (songId: string, run: string[] | null, direction: 1 | -1) => {
    if (!run) return false;
    const ranks = run.map((d) => bySong.get(songId)?.get(d));
    if (ranks.some((r) => r === undefined)) return false;
    for (let i = 0; i < ranks.length - 1; i++) {
      const change = ranks[i + 1]! - ranks[i]!; // positive = climbed
      if (direction === 1 ? change <= 0 : change >= 0) return false;
    }
    return true;
  };
  const three = consecutive(3);
  const two = consecutive(2);
  return {
    approachingTopTen: snapshot.entries
      .filter((e) => e.rank >= 11 && e.rank <= 25 && improving(e.songId, three, 1))
      .sort(bySongThenRank)
      .map((e) => item(e)),
    atRisk: snapshot.entries
      .filter((e) => e.rank >= 85 && improving(e.songId, two, -1))
      .sort((a, b) => b.rank - a.rank || a.songId.localeCompare(b.songId))
      .map((e) => item(e)),
    historyDays: dates.length,
  };
}

export function buildCommandCenter(input: {
  snapshot: ChartSnapshot | null;
  history: HistoryRow[];
  jobs: JobRow[];
  today: string;
  activeAnomalies: number;
  leadsAwaitingReview: number;
  youtube: { status: string; businessDate: string; jobId: string } | null;
}): CommandCenter {
  const { snapshot, history, jobs, today } = input;
  const health = healthTimeline(jobs, today, 14);
  const freshnessCard: Card = {
    key: "freshness",
    value: snapshot ? snapshot.date : null,
    detail: snapshot
      ? snapshot.date === today
        ? "fresh"
        : `stale:${Math.round((Date.parse(today) - Date.parse(snapshot.date)) / 86_400_000)}`
      : "none",
    href: "/dashboard/data-health",
    tone: snapshot?.date === today ? "good" : "alert",
  };
  const youtubeCard: Card = {
    key: "youtubeFreshness",
    value: input.youtube?.businessDate ?? null,
    detail: input.youtube?.status ?? "none",
    href: input.youtube ? `/dashboard/data-health/${input.youtube.jobId}` : "/dashboard/catalog/youtube",
    tone: input.youtube?.status === "succeeded" && input.youtube.businessDate === today ? "good" : "neutral",
  };
  const opsCards: Card[] = [
    { key: "anomalies", value: input.activeAnomalies, detail: null, href: "/dashboard/anomalies", tone: input.activeAnomalies ? "alert" : "good" },
    { key: "leads", value: input.leadsAwaitingReview, detail: null, href: "/dashboard/newsroom", tone: "neutral" },
    freshnessCard,
    youtubeCard,
  ];

  if (!snapshot) {
    return {
      version: COMMAND_CENTER_VERSION,
      hasChart: false,
      chartDate: null,
      cards: opsCards,
      topTen: [],
      gainers: [],
      fallers: [],
      emerging: [],
      newAndReEntries: [],
      approachingTopTen: [],
      atRisk: [],
      artistMomentum: [],
      localShare: [],
      health,
    };
  }

  const entries = [...snapshot.entries].sort(bySongThenRank);
  const numberOne = entries[0];
  const newEntries = entries.filter((e) => e.entryStatus === "new");
  const reEntries = entries.filter((e) => e.entryStatus === "re_entry");
  const moving = entries.filter((e) => e.entryStatus === "up" || e.entryStatus === "down" || e.entryStatus === "unchanged");
  const gainers = moving
    .filter((e) => (e.rankChange ?? 0) > 0)
    .sort((a, b) => weightedRise(b) - weightedRise(a) || a.rank - b.rank)
    .slice(0, 5)
    .map((e) => item(e));
  const fallers = moving
    .filter((e) => (e.rankChange ?? 0) < 0)
    .sort((a, b) => (a.rankChange ?? 0) - (b.rankChange ?? 0) || a.rank - b.rank)
    .slice(0, 5)
    .map((e) => item(e));
  const newPeaks = entries.filter(
    (e) => e.previousRank !== null && e.rank < e.previousRank && e.rank === e.peakRank,
  );
  const artistGroups = new Map<string, ChartEntry[]>();
  for (const e of entries) artistGroups.set(e.artist, [...(artistGroups.get(e.artist) ?? []), e]);
  const multi = [...artistGroups].filter(([, list]) => list.length >= 2);
  const artistMomentum = [...artistGroups]
    .map(([artist, list]) => ({
      artist,
      entries: list.length,
      topTwenty: list.filter((e) => e.rank <= 20).length,
      netChange: list.reduce((sum, e) => sum + (e.rankChange ?? 0), 0),
      bestRank: Math.min(...list.map((e) => e.rank)),
    }))
    .filter((a) => a.entries >= 2 || a.netChange >= 10)
    .sort((a, b) => b.netChange - a.netChange || b.entries - a.entries || a.bestRank - b.bestRank || a.artist.localeCompare(b.artist))
    .slice(0, 6);

  const { approachingTopTen, atRisk } = watchLists(snapshot, history);
  // Emerging: at most 14 days on chart and rising today (not a debut).
  const emerging = entries
    .filter((e) => e.daysOnChart <= 14 && (e.rankChange ?? 0) > 0)
    .sort((a, b) => weightedRise(b) - weightedRise(a) || a.rank - b.rank)
    .slice(0, 5)
    .map((e) => item(e, `days:${e.daysOnChart}`));

  const shareDates = [...new Set(history.map((r) => r.date))].sort();
  const localShare = shareDates.map((date) => {
    const rows = history.filter((r) => r.date === date);
    return {
      date,
      top100: rows.filter((r) => r.isLocal).length,
      top10: rows.filter((r) => r.isLocal && r.rank <= 10).length,
      href: chartHref(date),
    };
  });

  const highestNew = newEntries[0] ?? null;
  const gainer = gainers[0] ?? null;
  const faller = fallers[0] ?? null;
  const cards: Card[] = [
    {
      key: "numberOne",
      value: numberOne.title,
      detail: `${numberOne.artist}|${numberOne.previousRank === 1 ? "held" : "changed"}`,
      href: songHref(numberOne.songId),
    },
    { key: "newEntries", value: newEntries.length, detail: null, href: chartHref(snapshot.date) },
    { key: "reEntries", value: reEntries.length, detail: null, href: chartHref(snapshot.date) },
    {
      key: "highestNewEntry",
      value: highestNew ? highestNew.rank : null,
      detail: highestNew ? `${highestNew.title} · ${highestNew.artist}` : null,
      href: highestNew ? songHref(highestNew.songId) : chartHref(snapshot.date),
    },
    {
      key: "biggestGainer",
      value: gainer ? gainer.change : null,
      detail: gainer ? `${gainer.title} · №${gainer.rank}` : null,
      href: gainer ? gainer.href : "/dashboard/charts?sort=movement",
    },
    {
      key: "biggestFaller",
      value: faller ? faller.change : null,
      detail: faller ? `${faller.title} · №${faller.rank}` : null,
      href: faller ? faller.href : "/dashboard/charts?sort=movement",
    },
    {
      key: "newPeaks",
      value: newPeaks.length,
      detail: newPeaks.slice(0, 3).map((e) => e.title).join(", ") || null,
      href: newPeaks.length === 1 ? songHref(newPeaks[0].songId) : chartHref(snapshot.date),
    },
    {
      key: "localTop100",
      value: entries.filter((e) => e.isLocal).length,
      detail: String(entries.filter((e) => e.isLocal && e.rank <= 10).length),
      href: chartHref(snapshot.date),
    },
    {
      key: "multiEntryArtists",
      value: multi.length,
      detail: multi
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([artist, list]) => `${artist} (${list.length})`)
        .join(", ") || null,
      href: chartHref(snapshot.date),
    },
    ...opsCards,
  ];

  return {
    version: COMMAND_CENTER_VERSION,
    hasChart: true,
    chartDate: snapshot.date,
    cards,
    topTen: entries.slice(0, 10).map((e) => item(e)),
    gainers,
    fallers,
    emerging,
    newAndReEntries: [...newEntries, ...reEntries].sort(bySongThenRank).slice(0, 10).map((e) => item(e, e.entryStatus)),
    approachingTopTen,
    atRisk,
    artistMomentum,
    localShare,
    health,
  };
}

/** One row per business date: the collection job's outcome, or an explicit gap. */
export function healthTimeline(jobs: JobRow[], today: string, days: number): HealthDay[] {
  const collect = jobs.filter((j) => j.kind === "collect");
  return Array.from({ length: days }, (_, i) => addDays(today, -i)).map((date) => {
    const job = collect
      .filter((j) => j.businessDate === date)
      .sort((a, b) => rankStatus(a.status) - rankStatus(b.status) || a.id.localeCompare(b.id))[0];
    const status = (job?.status ?? "missing") as HealthDay["status"];
    return {
      date,
      status: ["succeeded", "failed", "review", "running", "queued"].includes(status) ? status : "missing",
      jobId: job?.id ?? null,
      href: job ? `/dashboard/data-health/${job.id}` : "/dashboard/data-health",
    };
  });
}

function rankStatus(status: string) {
  return ["succeeded", "review", "running", "queued", "failed"].indexOf(status) >>> 0;
}
