import { z } from "zod";
import type { Fact } from "./calculate";

// B3: statistical baselines (spec §9.4), `stats-v1`. Active only once at least
// `minimumDays` approved daily charts exist; before that the result says
// "baseline building: N of 30". Every output carries its inputs. No black box:
// medians, median absolute deviation (MAD) and a one-sided CUSUM.

export const STATS_V1 = "stats-v1";

export const baselineConfigSchema = z.object({
  minimumDays: z.number().int().positive().default(30),
  shortWindow: z.number().int().positive().default(7),
  longWindow: z.number().int().positive().default(30),
  outlierZ: z.number().positive().default(3.5),
  bandK: z.number().positive().default(2),
  bandMinimumObservations: z.number().int().positive().default(10),
  cusumSlack: z.number().nonnegative().default(1),
  cusumThreshold: z.number().positive().default(15),
});
export type BaselineConfig = z.infer<typeof baselineConfigSchema>;
export const defaultBaselineConfig = baselineConfigSchema.parse({});

export const zoneOf = (rank: number) => (rank <= 10 ? "1-10" : rank <= 40 ? "11-40" : "41-100");
const round = (v: number) => Math.round(v * 100) / 100;

export function median(values: number[]) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

/** Median absolute deviation. */
export function mad(values: number[]) {
  const m = median(values);
  return m === null ? null : median(values.map((v) => Math.abs(v - m)));
}

/** Modified z-score (Iglewicz–Hoaglin): 0.6745·(x − median) / MAD. */
export function modifiedZ(value: number, med: number, deviation: number) {
  if (deviation === 0) return value === med ? 0 : Infinity * Math.sign(value - med);
  return (0.6745 * (value - med)) / deviation;
}

/**
 * Robust z-score of a value against a sample. When MAD is 0 (most values
 * identical) it falls back to the mean absolute deviation scaled by 1.253314,
 * the standard Iglewicz–Hoaglin substitute, so a tiny difference is not
 * reported as infinitely unusual.
 */
export function robustZ(value: number, sample: number[]) {
  const med = median(sample);
  if (med === null) return null;
  const deviation = mad(sample)!;
  if (deviation > 0) return modifiedZ(value, med, deviation);
  const meanAD = sample.reduce((sum, v) => sum + Math.abs(v - med), 0) / sample.length;
  if (meanAD === 0) return value === med ? 0 : Infinity * Math.sign(value - med);
  return (value - med) / (1.253314 * meanAD);
}

/**
 * One-sided CUSUM on a series against its starting level: detects a sustained
 * shift up (climbing: ranks falling numerically) or down. Returns the index
 * where the cumulative sum first crossed the threshold, if any.
 */
export function cusum(series: number[], slack: number, threshold: number) {
  if (series.length < 2) return null;
  // Reference level: the median of the first five observations in the window.
  const target = median(series.slice(0, Math.min(5, series.length)))!;
  let up = 0, down = 0;
  for (let i = 0; i < series.length; i++) {
    // Rank improvement = target − rank.
    up = Math.max(0, up + (target - series[i]) - slack);
    down = Math.max(0, down + (series[i] - target) - slack);
    if (up > threshold) return { index: i, direction: "climbing" as const, target };
    if (down > threshold) return { index: i, direction: "falling" as const, target };
  }
  return null;
}

export type SongBaseline = {
  songId: string;
  entryId: string;
  rank: number;
  median7: number | null;
  median30: number | null;
  band: { low: number; high: number; observations: number } | null;
  outsideBand: "above" | "below" | null;
  movement: number | null;
  movementZ: number | null;
  movementOutlier: boolean;
  changePoint: { date: string; direction: "climbing" | "falling" } | null;
};

export function computeBaselines(facts: Fact[], date: string, config: BaselineConfig = defaultBaselineConfig) {
  const dates = [...new Set(facts.map((f) => f.snapshot_date))].filter((d) => d <= date).sort();
  const days = dates.length;
  if (days < config.minimumDays)
    return { version: STATS_V1, active: false as const, days, required: config.minimumDays, config, zones: [], songs: [] as SongBaseline[] };

  const rankOn = new Map<string, Map<string, number>>();
  const entryToday = new Map<string, Fact>();
  for (const f of facts) {
    if (f.snapshot_date > date) continue;
    const m = rankOn.get(f.song_id) ?? new Map<string, number>();
    m.set(f.snapshot_date, Math.min(m.get(f.snapshot_date) ?? 101, f.rank));
    rankOn.set(f.song_id, m);
    if (f.snapshot_date === date && (!entryToday.has(f.song_id) || f.rank < entryToday.get(f.song_id)!.rank)) entryToday.set(f.song_id, f);
  }
  const consecutive = (a: string, b: string) => Date.parse(b) - Date.parse(a) === 86_400_000;
  // Daily movements per zone over the long window (consecutive days only).
  const window = dates.slice(-config.longWindow);
  const zoneMoves = new Map<string, number[]>();
  for (let i = 1; i < window.length; i++) {
    if (!consecutive(window[i - 1], window[i])) continue;
    for (const [, ranks] of rankOn) {
      const a = ranks.get(window[i - 1]), b = ranks.get(window[i]);
      if (a === undefined || b === undefined) continue;
      const z = zoneOf(a);
      zoneMoves.set(z, [...(zoneMoves.get(z) ?? []), a - b]);
    }
  }
  const zones = ["1-10", "11-40", "41-100"].map((zone) => {
    const moves = zoneMoves.get(zone) ?? [];
    return { zone, observations: moves.length, median: median(moves), mad: mad(moves) };
  });
  const previousDate = dates[dates.length - 2];

  const songs: SongBaseline[] = [...entryToday.values()]
    .sort((a, b) => a.rank - b.rank || a.song_id.localeCompare(b.song_id))
    .map((e) => {
      const ranks = rankOn.get(e.song_id)!;
      const recent = (n: number) => dates.slice(-n).map((d) => ranks.get(d)).filter((r): r is number => r !== undefined);
      const r7 = recent(config.shortWindow), r30 = recent(config.longWindow);
      // Expected band from the window before today, so today is tested, not fitted.
      const before = dates.slice(-config.longWindow - 1, -1).map((d) => ranks.get(d)).filter((r): r is number => r !== undefined);
      const bm = median(before), bd = mad(before);
      const band = bm !== null && bd !== null && before.length >= config.bandMinimumObservations
        ? { low: Math.max(1, round(bm - config.bandK * Math.max(bd, 1))), high: Math.min(100, round(bm + config.bandK * Math.max(bd, 1))), observations: before.length }
        : null;
      const movement = previousDate && consecutive(previousDate, date) && ranks.has(previousDate) ? ranks.get(previousDate)! - e.rank : null;
      const zone = zones.find((z) => z.zone === zoneOf(ranks.get(previousDate ?? "") ?? e.rank))!;
      const z = movement !== null && zone.observations >= 20 ? robustZ(movement, zoneMoves.get(zone.zone) ?? []) : null;
      const series = r30;
      const cp = series.length >= 10 ? cusum(series, config.cusumSlack, config.cusumThreshold) : null;
      const cpDates = dates.slice(-config.longWindow).filter((d) => ranks.has(d));
      return {
        songId: e.song_id,
        entryId: e.entry_id,
        rank: e.rank,
        median7: median(r7),
        median30: median(r30),
        band,
        outsideBand: band ? (e.rank < band.low ? "above" : e.rank > band.high ? "below" : null) : null,
        movement,
        movementZ: z === null ? null : Number.isFinite(z) ? round(z) : z,
        movementOutlier: z !== null && Math.abs(z) > config.outlierZ,
        changePoint: cp ? { date: cpDates[cp.index], direction: cp.direction } : null,
      };
    });
  return { version: STATS_V1, active: true as const, days, required: config.minimumDays, config, zones, songs };
}
