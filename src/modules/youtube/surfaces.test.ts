import { describe, expect, test } from "vitest";
import {
  artistYouTubeSummary,
  coverageShare,
  inWindow,
  songViewTotals,
  releaseCurve,
  songYouTubeSummary,
  trackedChartCsv,
  viewsGained,
  windowStart,
  type TrackedRow,
} from "./surfaces";

const day = (date: string, views: number, multi = false) => ({ business_date: date, views_gained: views, multi_day: multi });
const tracked = (date: string, rank: number, over: Partial<TrackedRow> = {}): TrackedRow => ({
  business_date: date, rank, song_id: "s1", views_gained: 100, previous_rank: null, rank_change: null, peak_rank: rank, days_on_chart: 1, streak: 1, momentum: 50, ...over,
});

describe("window", () => {
  test("30-day mode starts 30 days before today (Ulaanbaatar)", () => {
    expect(windowStart({ mode: "30_day" }, new Date("2026-11-16T18:00:00Z"))).toBe("2026-10-18");
  });
  test("36-month mode keeps three years", () => {
    expect(windowStart({ mode: "36_month" }, new Date("2026-11-16T00:00:00Z"))).toBe("2023-11-16");
  });
  test("rows before the window are never returned", () => {
    expect(inWindow([day("2026-10-17", 1), day("2026-10-18", 2)], "2026-10-18").map((r) => r.views_gained)).toEqual([2]);
  });
});

describe("viewsGained", () => {
  test("sums the period and flags a multi-day value", () => {
    const rows = [day("2026-11-01", 5), day("2026-11-10", 10), day("2026-11-12", 30, true), day("2026-11-16", 1)];
    expect(viewsGained(rows, "2026-11-16", 7)).toEqual({ views: 41, days: 3, includesGap: true });
    expect(viewsGained(rows, "2026-11-16", 1)).toEqual({ views: 1, days: 1, includesGap: false });
  });
});

describe("songYouTubeSummary", () => {
  test("as-of date, gains, current rank and expired rows dropped", () => {
    const s = songYouTubeSummary({
      daily: [day("2026-10-01", 999), day("2026-11-15", 10), day("2026-11-16", 20)],
      chart: [tracked("2026-11-15", 9, { peak_rank: 9 }), tracked("2026-11-16", 4, { rank_change: 5, peak_rank: 4, days_on_chart: 2 })],
      start: "2026-10-18",
      release: null,
    });
    expect(s.asOf).toBe("2026-11-16");
    expect(s.last7?.views).toBe(30);
    expect(s.series.map((p) => p.date)).toEqual(["2026-11-15", "2026-11-16"]);
    expect(s.rank).toEqual({ rank: 4, change: 5, peak: 4, daysOnChart: 2 });
  });
  test("no rank when the song is off the chart on the latest day", () => {
    const s = songYouTubeSummary({ daily: [day("2026-11-16", 1)], chart: [tracked("2026-11-15", 50)], start: "2026-10-18", release: null });
    expect(s.rank).toBeNull();
    expect(s.rankHistory).toHaveLength(1);
  });
  test("empty before the first collection", () => {
    const s = songYouTubeSummary({ daily: [], chart: [], start: "2026-10-18", release: null });
    expect([s.asOf, s.last7, s.rank]).toEqual([null, null, null]);
  });
});

test("releaseCurve compares each age with the artist average", () => {
  const curve = releaseCurve({
    publishedAt: "2026-11-10T00:00:00Z",
    comparedReleases: 3,
    start: { "1": { views: 2000, observedAgeDays: 1 }, "3": { views: 5000, observedAgeDays: 4 }, "7": null },
    artistAverage: { "1": 1000, "3": null, "7": 8000 },
  })!;
  expect(curve.points).toEqual([
    { age: 1, views: 2000, observedAgeDays: 1, artistAverage: 1000, vsAverage: 2 },
    { age: 3, views: 5000, observedAgeDays: 4, artistAverage: null, vsAverage: null },
    { age: 7, views: null, observedAgeDays: null, artistAverage: 8000, vsAverage: null },
  ]);
});

test("artist summary picks the most-viewed video in the window and the latest release", () => {
  const a = artistYouTubeSummary({
    daily: [day("2026-11-16", 7)],
    videos: [
      { assetId: "a", videoId: "vid00000001", title: "Old", songId: "s1", views: 9_000_000, date: "2026-10-01" },
      { assetId: "b", videoId: "vid00000002", title: "Hit", songId: "s2", views: 5_000_000, date: "2026-11-16" },
    ],
    releases: [
      { songId: "s1", publishedAt: "2026-11-01T00:00:00Z", start: {}, artistAverage: {}, comparedReleases: 0 },
      { songId: "s2", publishedAt: "2026-11-12T00:00:00Z", start: {}, artistAverage: {}, comparedReleases: 1 },
    ],
    start: "2026-10-18",
  });
  expect(a.mostViewed?.title).toBe("Hit");
  expect(a.latestRelease?.songId).toBe("s2");
});

test("coverage share", () => {
  expect(coverageShare({ artistsWithChannel: 1, linkedVerified: 3, linkedSuggested: 0, candidates: 0, watched: 3, collectedOnLatest: 2, latestDate: "2026-11-16" })).toBe(66.7);
  expect(coverageShare({ artistsWithChannel: 0, linkedVerified: 0, linkedSuggested: 0, candidates: 0, watched: 0, collectedOnLatest: 0, latestDate: null })).toBeNull();
});

test("CSV escapes, blocks formula injection and attributes YouTube", () => {
  const csv = trackedChartCsv([{ ...tracked("2026-11-16", 1), title: '=HYPERLINK("x")', artist: "A, B" }]);
  const [header, line] = csv.trim().split("\n");
  expect(header.split(",").at(-1)).toBe("source");
  expect(line).toContain(`"'=HYPERLINK(""x"")"`);
  expect(line).toContain('"A, B"');
  expect(line.endsWith(",YouTube")).toBe(true);
});

test("song view totals count official verified videos and add them up", () => {
  const v = (songId: string, views: number, kind = "official_music_video", verification = "verified", asOf = "2026-11-17") => ({ songId, kind, verification, views, asOf });
  const t = songViewTotals([
    v("a", 1000), v("a", 500, "lyric_video"), v("a", 9999, "live"), v("a", 7777, "official_audio", "suggested"),
    v("b", 3000, "official_audio", "verified", "2026-11-18"),
  ], new Map([["a", "Song A"], ["b", "Song B"]]));
  expect(t.songs).toEqual([
    { songId: "b", title: "Song B", views: 3000, videos: 1 },
    { songId: "a", title: "Song A", views: 1500, videos: 2 },
  ]);
  expect(t.total).toBe(4500);
  expect(t.asOf).toBe("2026-11-18");
});
