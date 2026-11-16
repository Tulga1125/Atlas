import { describe, expect, test } from "vitest";
import { artistDays, engagement, releaseStarts, songDays, trackedCharts, videoGains, type StatRow, type VideoLink } from "./calculations";

const row = (assetId: string, date: string, views: number | null, extra: Partial<StatRow> = {}): StatRow => ({ assetId, date, views, likes: null, comments: null, approved: true, ...extra });
const link = (assetId: string, songId: string, kind = "official_music_video", verified = true): VideoLink => ({ assetId, songId, kind, verified, publishedAt: null });

describe("video gains", () => {
  test("daily gains from approved observations", () => {
    expect(videoGains([row("v", "2026-11-01", 100), row("v", "2026-11-02", 150), row("v", "2026-11-03", 175)])).toEqual([
      { assetId: "v", date: "2026-11-02", gained: 50, intervalDays: 1, multiDay: false },
      { assetId: "v", date: "2026-11-03", gained: 25, intervalDays: 1, multiDay: false },
    ]);
  });
  test("a multi-day gap is one multi-day value, never split into fake days", () => {
    expect(videoGains([row("v", "2026-11-01", 100), row("v", "2026-11-04", 400)])).toEqual([
      { assetId: "v", date: "2026-11-04", gained: 300, intervalDays: 3, multiDay: true },
    ]);
  });
  test("a deleted video mid-history: missing days are skipped, the return is multi-day", () => {
    const g = videoGains([row("v", "2026-11-01", 100), row("v", "2026-11-02", null, { approved: true }), row("v", "2026-11-03", 160)]);
    expect(g).toEqual([{ assetId: "v", date: "2026-11-03", gained: 60, intervalDays: 2, multiDay: true }]);
  });
  test("anomalies (not approved) are ignored", () => {
    expect(videoGains([row("v", "2026-11-01", 100), row("v", "2026-11-02", 90, { approved: false }), row("v", "2026-11-03", 130)])).toMatchObject([{ gained: 30, multiDay: true }]);
  });
});

describe("song and artist totals", () => {
  const gains = videoGains([row("mv", "2026-11-01", 0), row("mv", "2026-11-02", 100), row("audio", "2026-11-01", 0), row("audio", "2026-11-02", 40), row("live", "2026-11-01", 0), row("live", "2026-11-02", 999)]);
  test("only verified links of counting kinds, with a per-kind breakdown", () => {
    const days = songDays(gains, [link("mv", "s"), link("audio", "s", "official_audio"), link("live", "s", "live")]);
    expect(days).toEqual([{ songId: "s", date: "2026-11-02", gained: 140, eligible: true, multiDay: false, intervalDays: 1, byKind: { official_music_video: 100, official_audio: 40 }, videos: 2 }]);
  });
  test("an unverified link does not count", () => {
    expect(songDays(gains, [link("mv", "s", "official_music_video", false)])).toEqual([]);
  });
  test("duplicate asset rows count once", () => {
    expect(songDays(gains, [link("mv", "s"), link("mv", "s")])[0].gained).toBe(100);
  });
  test("a multi-day video makes the song ineligible for that day's chart", () => {
    const g = videoGains([row("a", "2026-11-01", 0), row("a", "2026-11-02", 10), row("b", "2026-10-30", 0), row("b", "2026-11-02", 30)]);
    expect(songDays(g, [link("a", "s"), link("b", "s")])).toMatchObject([{ date: "2026-11-02", gained: 40, eligible: false, multiDay: true, intervalDays: 3 }]);
  });
  test("an artist counts each song once, even with two credits on it", () => {
    const days = songDays(gains, [link("mv", "s1"), link("audio", "s2", "official_audio")]);
    expect(artistDays(days, [{ songId: "s1", artistId: "A" }, { songId: "s2", artistId: "A" }, { songId: "s1", artistId: "B" }, { songId: "s1", artistId: "A" }])).toEqual([
      { artistId: "A", date: "2026-11-02", gained: 140, songs: 2, multiDay: false },
      { artistId: "B", date: "2026-11-02", gained: 100, songs: 1, multiDay: false },
    ]);
  });
  test("a relinked video moves its whole history to the new song on recalculation", () => {
    const g = videoGains([row("mv", "2026-11-01", 0), row("mv", "2026-11-02", 50), row("mv", "2026-11-03", 80)]);
    const before = songDays(g, [link("mv", "old")]);
    const after = songDays(g, [link("mv", "new")]);
    expect(before.map((d) => d.songId)).toEqual(["old", "old"]);
    expect(after.map((d) => `${d.songId}:${d.date}:${d.gained}`)).toEqual(["new:2026-11-02:50", "new:2026-11-03:30"]);
  });
});

describe("tracked chart", () => {
  const day = (songId: string, date: string, gained: number, eligible = true) => ({ songId, date, gained, eligible, multiDay: !eligible, intervalDays: eligible ? 1 : 2, byKind: {}, videos: 1 });
  test("ranked by single-day gains with rank change, peak, tenure and streak", () => {
    const chart = trackedCharts([day("a", "2026-11-01", 100), day("b", "2026-11-01", 50), day("a", "2026-11-02", 10), day("b", "2026-11-02", 70)], ["2026-11-01", "2026-11-02"]);
    expect(chart.filter((c) => c.date === "2026-11-02").map((c) => [c.songId, c.rank, c.previousRank, c.rankChange, c.peakRank, c.daysOnChart, c.streak])).toEqual([
      ["b", 1, 2, 1, 1, 2, 1],
      ["a", 2, 1, -1, 1, 2, 0],
    ]);
  });
  test("ineligible (multi-day) songs and zero gains are left out", () => {
    expect(trackedCharts([day("a", "2026-11-01", 100, false), day("b", "2026-11-01", 0)], ["2026-11-01"])).toEqual([]);
  });
  test("a gap between chart dates means no rank change", () => {
    const chart = trackedCharts([day("a", "2026-11-01", 100), day("a", "2026-11-03", 100)], ["2026-11-01", "2026-11-03"]);
    expect(chart.at(-1)).toMatchObject({ previousRank: null, rankChange: null, daysOnChart: 2 });
  });
  test("shuffled input gives identical output", () => {
    const days = [day("a", "2026-11-01", 100), day("b", "2026-11-01", 100), day("c", "2026-11-02", 5)];
    expect(trackedCharts([...days].reverse(), ["2026-11-02", "2026-11-01"])).toEqual(trackedCharts(days, ["2026-11-01", "2026-11-02"]));
  });
});

test("engagement ratios per 1,000 views; hidden counts stay empty", () => {
  expect(engagement([row("v", "2026-11-02", 2000, { likes: 50, comments: null })], "2026-11-02")).toEqual([{ assetId: "v", likesPerThousand: 25, commentsPerThousand: null }]);
});

test("release starts compare with the artist's earlier releases at the same age", () => {
  const links: VideoLink[] = [
    { assetId: "old", songId: "s1", kind: "official_music_video", verified: true, publishedAt: "2026-09-01T00:00:00Z" },
    { assetId: "new", songId: "s2", kind: "official_music_video", verified: true, publishedAt: "2026-11-01T00:00:00Z" },
  ];
  const rows = [row("old", "2026-09-02", 1000), row("old", "2026-09-04", 3000), row("old", "2026-09-08", 6000), row("new", "2026-11-02", 2000), row("new", "2026-11-05", 5000)];
  const starts = releaseStarts(rows, links, [{ songId: "s1", artistId: "A" }, { songId: "s2", artistId: "A" }], "2026-11-06");
  expect(starts).toEqual([
    {
      assetId: "new",
      songId: "s2",
      publishedAt: "2026-11-01T00:00:00Z",
      start: { 1: { views: 2000, observedAgeDays: 1 }, 3: { views: 5000, observedAgeDays: 4 }, 7: null },
      artistAverage: { 1: 1000, 3: 3000, 7: 6000 },
      comparedReleases: 1,
    },
  ]);
});

test("v2: a confirmed video on the artist's own channel counts whatever its kind", async () => {
  const { countsTowardsSong } = await import("./calculations");
  expect(countsTowardsSong({ songId: "s", verified: true, kind: "other", ownChannel: true })).toBe(true);
  expect(countsTowardsSong({ songId: "s", verified: true, kind: "live", ownChannel: true })).toBe(true);
  expect(countsTowardsSong({ songId: "s", verified: true, kind: "other", ownChannel: false })).toBe(false);
  expect(countsTowardsSong({ songId: "s", verified: true, kind: "lyric_video", ownChannel: false })).toBe(true);
  expect(countsTowardsSong({ songId: "s", verified: false, kind: "official_music_video", ownChannel: true })).toBe(false);
});
