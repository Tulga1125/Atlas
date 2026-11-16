import { describe, expect, it } from "vitest";
import { calculateChart, type Fact } from "./calculate";
const fact = (date: string, song: string, rank: number): Fact => ({
  entry_id: `${date}:${song}:${rank}`,
  snapshot_id: date,
  snapshot_date: date,
  song_id: song,
  platform_asset_id: song,
  rank,
  artist_id: "artist",
  title: song,
  artist: "Artist",
  locality: "local",
});
describe("historical calculations", () => {
  it("distinguishes re-entry from movement since last appearance", () => {
    const result = calculateChart(
      [
        fact("2026-09-01", "a", 2),
        fact("2026-09-02", "b", 1),
        fact("2026-09-03", "a", 3),
      ],
      "2026-09-03",
    );
    expect(result.metrics[0]).toMatchObject({
      entryStatus: "re_entry",
      previousRank: null,
      rankChange: null,
      daysOnChart: 2,
      consecutiveDays: 1,
    });
  });
  it("excludes future history and never interpolates missing days", () => {
    const result = calculateChart(
      [
        fact("2026-09-01", "a", 20),
        fact("2026-09-03", "a", 10),
        fact("2026-09-04", "a", 1),
      ],
      "2026-09-03",
    );
    expect(result.metrics[0]).toMatchObject({
      peakRank: 10,
      daysOnChart: 2,
      weeklyRankChange: null,
      consecutiveDays: 1,
    });
    expect(result.summary.gapDays).toBe(1);
  });
  it("uses the exact date for weekly changes and emits multiple independent rules", () => {
    const result = calculateChart(
      [
        fact("2026-08-27", "a", 50),
        fact("2026-09-02", "a", 30),
        fact("2026-09-03", "a", 1),
      ],
      "2026-09-03",
    );
    expect(result.metrics[0].weeklyRankChange).toBe(49);
    expect(result.signals.map((s) => s.type)).toEqual(
      expect.arrayContaining([
        "new_number_one",
        "rank_jump_20",
        "new_peak",
        "new_top_10",
        "local_new_peak",
      ]),
    );
  });
  it("deduplicates canonical versions in tenure and artist aggregates", () => {
    const result = calculateChart(
      [fact("2026-09-01", "a", 2), fact("2026-09-01", "a", 5)],
      "2026-09-01",
    );
    expect(result.metrics.every((m) => m.daysOnChart === 1)).toBe(true);
    expect(result.summary.artists[0].chartingSongs).toBe(1);
  });
  it("replays deterministically regardless of source array order", () => {
    const facts = [
      fact("2026-09-01", "a", 40),
      fact("2026-09-02", "a", 30),
      fact("2026-09-03", "a", 20),
      fact("2026-09-04", "a", 10),
    ];
    expect(calculateChart(facts, "2026-09-04")).toEqual(
      calculateChart([...facts].reverse(), "2026-09-04"),
    );
  });
});
