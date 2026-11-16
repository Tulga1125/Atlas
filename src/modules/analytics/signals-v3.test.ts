import { describe, expect, test } from "vitest";
import type { Fact } from "./calculate";
import { defaultSignalConfig, extendedSignals } from "./signals-v3";

const day = (n: number) => {
  const d = new Date("2026-10-01T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
type Spec = { song: string; artist?: string; local?: boolean; album?: string; ranks: (number | null)[] };

/** One fact per song per day; null = not on the chart that day. Filler songs keep every day's chart non-empty. */
function facts(specs: Spec[], days: number): Fact[] {
  const out: Fact[] = [];
  for (let d = 0; d < days; d++)
    for (const s of [...specs, { song: "filler", ranks: Array(days).fill(100) }] as Spec[]) {
      const r = s.ranks[d];
      if (r === null || r === undefined) continue;
      out.push({
        entry_id: `${s.song}-${d}`,
        snapshot_id: `snap-${d}`,
        snapshot_date: day(d),
        song_id: s.song,
        platform_asset_id: `asset-${s.song}`,
        rank: r,
        artist_id: s.artist ?? `artist-${s.song}`,
        title: s.song,
        artist: s.artist ?? `Artist ${s.song}`,
        locality: s.local ? "local" : "international",
        raw_metadata: s.album ? { albumName: s.album } : {},
      });
    }
  return out;
}
const types = (f: Fact[], d: number, songFilter?: string) =>
  extendedSignals(f, day(d)).signals.filter((s) => !songFilter || s.songId === songFilter).map((s) => s.type);

describe("threshold_crossing", () => {
  test("first-ever Top 20, highest threshold crossed, one signal", () => {
    const f = facts([{ song: "a", ranks: [60, 55, 18] }], 3);
    const s = extendedSignals(f, day(2)).signals.find((x) => x.type === "threshold_crossing");
    expect(s).toMatchObject({ songId: "a", severity: "high", facts: { threshold: 20 } });
    expect(s!.explanation).toContain("never been inside the Top 20");
  });
  test("near miss: it had been inside the Top 20 before", () => {
    expect(types(facts([{ song: "a", ranks: [15, 60, 18] }], 3), 2, "a")).not.toContain("threshold_crossing");
  });
  test("Top 10 is left to new_top_10", () => {
    expect(types(facts([{ song: "a", ranks: [60, 9] }], 2), 1, "a")).not.toContain("threshold_crossing");
  });
});

describe("fastest_climber", () => {
  test("4→2 beats 90→60", () => {
    const f = facts([{ song: "near-top", ranks: [4, 2] }, { song: "far", ranks: [90, 60] }], 2);
    expect(extendedSignals(f, day(1)).signals.filter((s) => s.type === "fastest_climber").map((s) => s.songId)).toEqual(["near-top"]);
  });
  test("near miss: rises below the minimum do not count", () => {
    expect(types(facts([{ song: "a", ranks: [3, 2] }], 2), 1)).not.toContain("fastest_climber");
  });
  test("a gap day is not movement", () => {
    expect(types(facts([{ song: "a", ranks: [40, null, 20] }].map((s) => s), 3).filter((x) => x.snapshot_date !== day(1)), 2)).not.toContain("fastest_climber");
  });
});

describe("breakout", () => {
  test("up on 3 of the last 4 days, 15+ places, from outside the Top 40", () => {
    expect(types(facts([{ song: "a", ranks: [70, 62, 64, 55, 48] }], 5), 4, "a")).toContain("breakout");
  });
  test("near miss: total gain too small", () => {
    expect(types(facts([{ song: "a", ranks: [50, 48, 49, 46, 44] }], 5), 4, "a")).not.toContain("breakout");
  });
  test("near miss: started inside the Top 40", () => {
    expect(types(facts([{ song: "a", ranks: [39, 35, 30, 28, 20] }], 5), 4, "a")).not.toContain("breakout");
  });
});

describe("slow_burn", () => {
  const steady = (start: number) => Array.from({ length: 28 }, (_, i) => start - Math.floor(i / 2));
  test("weekly averages improve three weeks running with no big jump", () => {
    expect(types(facts([{ song: "a", ranks: steady(80) }], 28), 27, "a")).toContain("slow_burn");
  });
  test("near miss: one 20-place jump disqualifies it", () => {
    const r = steady(80);
    r[20] = r[19] - 25;
    expect(types(facts([{ song: "a", ranks: r }], 28), 27, "a")).not.toContain("slow_burn");
  });
});

describe("sudden_revival", () => {
  test("an old song climbs 10+ places", () => {
    const ranks = Array(70).fill(80);
    ranks[69] = 60;
    expect(types(facts([{ song: "a", ranks }], 70), 69, "a")).toContain("sudden_revival");
  });
  test("returns after 14+ days, better than it left", () => {
    const ranks: (number | null)[] = [50, ...Array(15).fill(null), 30];
    expect(types(facts([{ song: "a", ranks }], 17), 16, "a")).toContain("sudden_revival");
  });
  test("near miss: returns after only 5 days", () => {
    const ranks: (number | null)[] = [50, ...Array(5).fill(null), 30];
    expect(types(facts([{ song: "a", ranks }], 7), 6, "a")).not.toContain("sudden_revival");
  });
});

describe("artist rules", () => {
  test("artist_takeover: three songs in the Top 20", () => {
    const f = facts([1, 2, 3].map((n) => ({ song: `s${n}`, artist: "X", ranks: [n * 5] })), 1);
    expect(extendedSignals(f, day(0)).signals.filter((s) => s.type === "artist_takeover").map((s) => s.artistId)).toEqual(["X"]);
  });
  test("near miss: two in the Top 20", () => {
    expect(types(facts([1, 2].map((n) => ({ song: `s${n}`, artist: "X", ranks: [n * 5] })), 1), 0)).not.toContain("artist_takeover");
  });
  test("catalog_effect: a debut lifts two older songs", () => {
    const f = facts([
      { song: "old1", artist: "X", ranks: [50, 40] },
      { song: "old2", artist: "X", ranks: [70, 60] },
      { song: "debut", artist: "X", ranks: [null, 15] },
    ], 2);
    expect(types(f, 1)).toContain("catalog_effect");
  });
  test("near miss: only one older song rose", () => {
    const f = facts([
      { song: "old1", artist: "X", ranks: [50, 40] },
      { song: "old2", artist: "X", ranks: [70, 75] },
      { song: "debut", artist: "X", ranks: [null, 15] },
    ], 2);
    expect(types(f, 1)).not.toContain("catalog_effect");
  });
});

describe("international_release_wave", () => {
  test("three tracks of one international album enter together", () => {
    const f = facts(["t1", "t2", "t3"].map((t, i) => ({ song: t, artist: "Intl", album: "Big Album", ranks: [null, 20 + i] })), 2);
    expect(types(f, 1)).toContain("international_release_wave");
  });
  test("near miss: a local album does not count", () => {
    const f = facts(["t1", "t2", "t3"].map((t, i) => ({ song: t, artist: "Local", local: true, album: "Album", ranks: [null, 20 + i] })), 2);
    expect(types(f, 1)).not.toContain("international_release_wave");
  });
  test("without album metadata it is skipped and says why", () => {
    const f = facts([{ song: "a", ranks: [10] }], 1).map((x) => ({ ...x, raw_metadata: {} }));
    expect(extendedSignals(f, day(0)).skipped).toEqual([{ type: "international_release_wave", reason: "no album metadata on today's chart entries" }]);
  });
});

describe("resilience and volatility", () => {
  test("resilience: steady while its zone falls", () => {
    const fallers = [1, 2, 3, 4].map((n) => ({ song: `f${n}`, ranks: Array.from({ length: 7 }, (_, i) => 50 + n + i * 3) }));
    const f = facts([{ song: "steady", ranks: [45, 46, 45, 44, 45, 46, 45] }, ...fallers], 7);
    expect(types(f, 6, "steady")).toContain("resilience");
  });
  test("near miss: steady while the zone is also steady", () => {
    const flat = [1, 2, 3].map((n) => ({ song: `f${n}`, ranks: Array(7).fill(60 + n) }));
    expect(types(facts([{ song: "steady", ranks: [45, 46, 45, 44, 45, 46, 45] }, ...flat], 7), 6, "steady")).not.toContain("resilience");
  });
  test("high_volatility above the zone threshold", () => {
    expect(types(facts([{ song: "a", ranks: [10, 40, 12, 45, 8, 50, 30] }], 7), 6, "a")).toContain("high_volatility");
  });
  test("near miss: small swings in the Top 10", () => {
    expect(types(facts([{ song: "a", ranks: [3, 5, 4, 6, 3, 5, 4] }], 7), 6, "a")).not.toContain("high_volatility");
  });
});

test("every signal explains itself from stored facts and carries its rule version", () => {
  const f = facts([{ song: "a", ranks: [70, 62, 64, 55, 48] }], 5);
  for (const s of extendedSignals(f, day(4)).signals) {
    expect(s.ruleVersion).toBe("signals-v3");
    expect(s.explanation.length).toBeGreaterThan(10);
  }
});

test("shuffled input gives identical output", () => {
  const f = facts([{ song: "a", ranks: [70, 62, 64, 55, 48] }, { song: "b", ranks: [4, 2, 3, 2, 1] }], 5);
  expect(extendedSignals([...f].reverse(), day(4))).toEqual(extendedSignals(f, day(4)));
});

test("thresholds come from configuration", () => {
  const f = facts([{ song: "a", ranks: [70, 62, 64, 55, 48] }], 5);
  expect(extendedSignals(f, day(4), { ...defaultSignalConfig, breakoutMinGain: 50 }).signals.map((s) => s.type)).not.toContain("breakout");
});
