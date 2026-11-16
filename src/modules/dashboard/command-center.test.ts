import { describe, expect, test } from "vitest";
import type { ChartEntry, ChartSnapshot } from "@/modules/charts/types";
import {
  buildCommandCenter,
  healthTimeline,
  watchLists,
  weightedRise,
  type HistoryRow,
} from "./command-center";

function entry(rank: number, over: Partial<ChartEntry> = {}): ChartEntry {
  return {
    rank,
    previousRank: rank,
    rankChange: 0,
    entryStatus: "unchanged",
    songId: `song-${String(rank).padStart(3, "0")}`,
    title: `Song ${rank}`,
    artist: `Artist ${rank}`,
    artworkUrl: null,
    sourceUrl: null,
    peakRank: 1,
    daysOnChart: 30,
    isLocal: false,
    momentumScore: 0,
    ...over,
  };
}

function snapshot(entries: ChartEntry[], date = "2026-11-16"): ChartSnapshot {
  return {
    id: "snap",
    chartId: "chart",
    chartName: "Apple Music Mongolia",
    date,
    collectedAt: `${date}T06:00:00Z`,
    sourceTimestamp: null,
    status: "approved",
    entryCount: entries.length,
    isDemo: false,
    entries,
  };
}

const base = {
  history: [] as HistoryRow[],
  jobs: [],
  today: "2026-11-16",
  activeAnomalies: 0,
  leadsAwaitingReview: 0,
  youtube: null,
};

describe("empty state", () => {
  test("before the first approved chart, only operational cards and an explicit gap timeline", () => {
    const cc = buildCommandCenter({ ...base, snapshot: null });
    expect(cc.hasChart).toBe(false);
    expect(cc.cards.map((c) => c.key)).toEqual(["anomalies", "leads", "freshness", "youtubeFreshness", "baseline"]);
    expect(cc.cards.at(-1)).toMatchObject({ value: "0/30", detail: "building" });
    expect(cc.cards.find((c) => c.key === "freshness")).toMatchObject({ value: null, detail: "none", tone: "alert" });
    expect(cc.health).toHaveLength(14);
    expect(cc.health.every((d) => d.status === "missing")).toBe(true);
    expect(cc.topTen).toEqual([]);
  });
});

describe("summary cards", () => {
  const entries = [
    entry(1, { previousRank: 1, rankChange: 0, peakRank: 1, title: "Хайртай", artist: "Saran", isLocal: true }),
    entry(2, { previousRank: 4, rankChange: 2, peakRank: 2, artist: "Saran", isLocal: true }),
    entry(3, { previousRank: null, rankChange: null, entryStatus: "new", peakRank: 3, daysOnChart: 1 }),
    entry(60, { previousRank: 90, rankChange: 30, entryStatus: "up", peakRank: 40 }),
    entry(70, { previousRank: 20, rankChange: -50, entryStatus: "down" }),
    entry(80, { previousRank: null, rankChange: null, entryStatus: "re_entry", peakRank: 12 }),
  ].map((e) => (e.rankChange && e.rankChange > 0 && e.entryStatus === "unchanged" ? { ...e, entryStatus: "up" as const } : e));
  const cc = buildCommandCenter({ ...base, snapshot: snapshot(entries), activeAnomalies: 2, leadsAwaitingReview: 3 });
  const card = (key: string) => cc.cards.find((c) => c.key === key)!;

  test("No. 1 and whether it held, linked to the song", () => {
    expect(card("numberOne")).toMatchObject({ value: "Хайртай", detail: "Saran|held", href: "/songs/song-001" });
  });
  test("entries, re-entries and the highest new entry", () => {
    expect(card("newEntries").value).toBe(1);
    expect(card("reEntries").value).toBe(1);
    expect(card("highestNewEntry")).toMatchObject({ value: 3, href: "/songs/song-003" });
  });
  test("biggest gainer is position-weighted: 4→2 beats 90→60", () => {
    expect(card("biggestGainer")).toMatchObject({ value: 2, href: "/songs/song-002" });
    expect(weightedRise({ rank: 2, rankChange: 2, previousRank: 4 })).toBeGreaterThan(
      weightedRise({ rank: 60, rankChange: 30, previousRank: 90 }),
    );
  });
  test("biggest faller and new career peaks", () => {
    expect(card("biggestFaller")).toMatchObject({ value: -50, href: "/songs/song-070" });
    expect(card("newPeaks")).toMatchObject({ value: 1, href: "/songs/song-002" }); // 4→2 is a new peak; holding No. 1 is not
  });
  test("Mongolian songs and artists with multiple entries", () => {
    expect(card("localTop100")).toMatchObject({ value: 2, detail: "2" });
    expect(card("multiEntryArtists")).toMatchObject({ value: 1, detail: "Saran (2)" });
  });
  test("operational counts link to their workspaces", () => {
    expect(card("anomalies")).toMatchObject({ value: 2, href: "/dashboard/anomalies", tone: "alert" });
    expect(card("leads")).toMatchObject({ value: 3, href: "/dashboard/newsroom" });
    expect(card("freshness")).toMatchObject({ detail: "fresh", tone: "good" });
  });
  test("every card links somewhere", () => {
    expect(cc.cards.every((c) => c.href.startsWith("/"))).toBe(true);
  });
  test("new and re-entries are listed together", () => {
    expect(cc.newAndReEntries.map((s) => s.note)).toEqual(["new", "re_entry"]);
  });

  test("shuffled input gives identical output", () => {
    const shuffled = [...entries].reverse();
    expect(buildCommandCenter({ ...base, snapshot: snapshot(shuffled), activeAnomalies: 2, leadsAwaitingReview: 3 })).toEqual(cc);
  });
});

describe("watch lists", () => {
  const h = (date: string, rank: number, songId = "song-015"): HistoryRow => ({ date, songId, rank, isLocal: false, artist: "A" });

  test("approaching Top 10 needs three consecutive daily climbs", () => {
    const history = [h("2026-11-13", 30), h("2026-11-14", 24), h("2026-11-15", 19), h("2026-11-16", 15)];
    const now = snapshot([entry(15, { previousRank: 19, rankChange: 4, entryStatus: "up" })]);
    expect(watchLists(now, history).approachingTopTen.map((s) => s.songId)).toEqual(["song-015"]);
  });

  test("a gap in the archive never counts as movement", () => {
    const history = [h("2026-11-12", 30), h("2026-11-14", 24), h("2026-11-15", 19), h("2026-11-16", 15)];
    const now = snapshot([entry(15, { previousRank: 19, rankChange: 4, entryStatus: "up" })]);
    expect(watchLists(now, history).approachingTopTen).toEqual([]);
  });

  test("a single flat day breaks the run", () => {
    const history = [h("2026-11-13", 30), h("2026-11-14", 24), h("2026-11-15", 24), h("2026-11-16", 15)];
    const now = snapshot([entry(15, { previousRank: 24, rankChange: 9, entryStatus: "up" })]);
    expect(watchLists(now, history).approachingTopTen).toEqual([]);
  });

  test("at risk of leaving: bottom of the chart and falling two days running", () => {
    const history = [h("2026-11-14", 80, "song-095"), h("2026-11-15", 88, "song-095"), h("2026-11-16", 95, "song-095")];
    const now = snapshot([entry(95, { previousRank: 88, rankChange: -7, entryStatus: "down" })]);
    expect(watchLists(now, history).atRisk.map((s) => s.songId)).toEqual(["song-095"]);
  });
});

test("local share over time comes only from stored dates", () => {
  const history: HistoryRow[] = [
    { date: "2026-11-15", songId: "a", rank: 1, isLocal: true, artist: "A" },
    { date: "2026-11-15", songId: "b", rank: 50, isLocal: true, artist: "B" },
    { date: "2026-11-16", songId: "a", rank: 12, isLocal: true, artist: "A" },
  ];
  const cc = buildCommandCenter({ ...base, snapshot: snapshot([entry(1)]), history });
  expect(cc.localShare).toEqual([
    { date: "2026-11-15", top100: 2, top10: 1, href: "/charts/apple-music-mongolia?date=2026-11-15" },
    { date: "2026-11-16", top100: 1, top10: 0, href: "/charts/apple-music-mongolia?date=2026-11-16" },
  ]);
});

test("health timeline marks missed days as gaps and links each job", () => {
  const days = healthTimeline(
    [
      { id: "j1", kind: "collect", businessDate: "2026-11-16", status: "succeeded", errorCode: null },
      { id: "j0", kind: "collect", businessDate: "2026-11-15", status: "failed", errorCode: "source_http_500" },
      { id: "j2", kind: "calculate", businessDate: "2026-11-14", status: "succeeded", errorCode: null },
    ],
    "2026-11-16",
    3,
  );
  expect(days).toEqual([
    { date: "2026-11-16", status: "succeeded", jobId: "j1", href: "/dashboard/data-health/j1" },
    { date: "2026-11-15", status: "failed", jobId: "j0", href: "/dashboard/data-health/j0" },
    { date: "2026-11-14", status: "missing", jobId: null, href: "/dashboard/data-health" },
  ]);
});
