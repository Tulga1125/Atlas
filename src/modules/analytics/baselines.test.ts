import { describe, expect, test } from "vitest";
import type { Fact } from "./calculate";
import { computeBaselines, cusum, defaultBaselineConfig, mad, median, modifiedZ, robustZ } from "./baselines";

const day = (n: number) => new Date(Date.UTC(2026, 8, 1) + n * 86_400_000).toISOString().slice(0, 10);
function series(songs: Record<string, number[]>, days: number): Fact[] {
  const out: Fact[] = [];
  for (let d = 0; d < days; d++)
    for (const [song, ranks] of Object.entries(songs))
      if (ranks[d] !== undefined)
        out.push({ entry_id: `${song}-${d}`, snapshot_id: `s${d}`, snapshot_date: day(d), song_id: song, platform_asset_id: `a-${song}`, rank: ranks[d], artist_id: null, title: song, artist: "", locality: "international" });
  return out;
}
// Background songs give each zone enough movements for the outlier test.
const background = (days: number) =>
  Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`bg${i}`, Array.from({ length: days }, (_, d) => 41 + i + ((d + i) % 3) - 1)]));

test("primitives", () => {
  expect(median([5, 1, 3])).toBe(3);
  expect(median([1, 2, 3, 4])).toBe(2.5);
  expect(mad([1, 1, 2, 2, 4, 6, 9])).toBe(1);
  expect(modifiedZ(10, 0, 1)).toBeCloseTo(6.745);
  expect(median([])).toBeNull();
});

test("robust z falls back to the mean absolute deviation when MAD is 0", () => {
  const sample = [-1, -1, 2, -1, -1, 2, -1, -1, 2];
  expect(mad(sample)).toBe(0);
  expect(robustZ(0, sample)).toBeCloseTo(1 / 1.253314, 3); // median −1, mean absolute deviation 1
  expect(robustZ(-1, sample)).toBe(0);
});

test("gated until 30 approved days: says how far along it is", () => {
  const r = computeBaselines(series({ a: Array(12).fill(5) }, 12), day(11));
  expect(r).toMatchObject({ active: false, days: 12, required: 30, songs: [] });
});

describe("synthetic series (40 days)", () => {
  test("flat: inside its band, no outlier, no change point", () => {
    const r = computeBaselines(series({ flat: Array(40).fill(50), ...background(40) }, 40), day(39));
    const s = r.songs.find((x) => x.songId === "flat")!;
    expect(r.active).toBe(true);
    expect([s.median7, s.median30, s.outsideBand, s.movementOutlier, s.changePoint]).toEqual([50, 50, null, false, null]);
  });

  test("trending: a steady climb is a change point, not an outlier", () => {
    const climb = Array.from({ length: 40 }, (_, d) => 90 - d * 2);
    const s = computeBaselines(series({ climb, ...background(40) }, 40), day(39)).songs.find((x) => x.songId === "climb")!;
    expect(s.changePoint?.direction).toBe("climbing");
    expect(s.movementOutlier).toBe(false);
  });

  test("one spike: outside the expected band and a movement outlier for its zone", () => {
    const spike = [...Array(39).fill(70), 15];
    const s = computeBaselines(series({ spike, ...background(40) }, 40), day(39)).songs.find((x) => x.songId === "spike")!;
    expect(s.outsideBand).toBe("above");
    expect(s.movement).toBe(55);
    expect(s.movementOutlier).toBe(true);
  });

  test("regime change: a jump to a new level is detected by CUSUM", () => {
    const regime = [...Array(25).fill(80), ...Array(15).fill(30)];
    const s = computeBaselines(series({ regime, ...background(40) }, 40), day(39)).songs.find((x) => x.songId === "regime")!;
    expect(s.changePoint).toMatchObject({ direction: "climbing", date: day(25) });
  });
});

test("CUSUM stays quiet on noise around a level", () => {
  expect(cusum([50, 51, 49, 50, 52, 48, 50, 51, 49, 50], defaultBaselineConfig.cusumSlack, defaultBaselineConfig.cusumThreshold)).toBeNull();
});

test("every output carries its version and configuration", () => {
  const r = computeBaselines(series({ a: Array(31).fill(5), ...background(31) }, 31), day(30));
  expect([r.version, r.config.minimumDays, r.zones.map((z) => z.zone)]).toEqual(["stats-v1", 30, ["1-10", "11-40", "41-100"]]);
});
