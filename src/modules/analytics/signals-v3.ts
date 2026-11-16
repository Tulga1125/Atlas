import { z } from "zod";
import type { Fact } from "./calculate";

// B2: the rest of the rule-based signal set (spec §9.1), `signals-v3`.
// Transparent rules only. Each signal states the stored facts it rests on.
// "Consecutive days" always means consecutive approved chart dates with no
// calendar gap: a missing day is never treated as movement.

export const SIGNALS_V3 = "signals-v3";

export const signalConfigSchema = z.object({
  thresholds: z.array(z.number().int().min(1).max(100)).default([50, 40, 20]),
  fastestMinRise: z.number().int().positive().default(2),
  breakoutMinGain: z.number().int().positive().default(15),
  breakoutStartOutside: z.number().int().positive().default(40),
  slowBurnWeeks: z.number().int().min(2).default(3),
  slowBurnMinDaysPerWeek: z.number().int().min(1).max(7).default(4),
  revivalOldDays: z.number().int().positive().default(60),
  revivalAbsentDays: z.number().int().positive().default(14),
  revivalMinGain: z.number().int().positive().default(10),
  takeoverTopTwenty: z.number().int().positive().default(3),
  takeoverEntries: z.number().int().positive().default(5),
  catalogMinOlderRising: z.number().int().positive().default(2),
  releaseWaveMinTracks: z.number().int().positive().default(3),
  resilienceDays: z.number().int().positive().default(7),
  resilienceBand: z.number().int().nonnegative().default(2),
  resilienceZoneFall: z.number().default(-1),
  volatilityDays: z.number().int().positive().default(7),
  volatilityStdDev: z.object({ top: z.number(), middle: z.number(), bottom: z.number() }).default({ top: 3, middle: 8, bottom: 12 }),
  jumpThreshold: z.number().int().positive().default(20),
});
export type SignalConfig = z.infer<typeof signalConfigSchema>;
export const defaultSignalConfig = signalConfigSchema.parse({});

export type ExtendedSignal = {
  type: string;
  ruleVersion: string;
  entryId: string;
  songId: string;
  artistId: string | null;
  severity: "medium" | "high";
  headline: string;
  explanation: string;
  facts: Record<string, unknown>;
};

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const zoneOf = (rank: number) => (rank <= 10 ? "top" : rank <= 40 ? "middle" : "bottom");
const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const round = (v: number) => Math.round(v * 100) / 100;

type Entry = Fact & { album?: string | null };

/** Album name from the stored Apple entry metadata, when present. */
export function albumOf(f: Fact): string | null {
  const meta = f.raw_metadata;
  return meta && typeof meta === "object" && typeof (meta as Record<string, unknown>).albumName === "string"
    ? ((meta as Record<string, unknown>).albumName as string) || null
    : null;
}

/**
 * `facts` is every approved fact up to and including `date`. Returns the
 * B2 signals for the chart on `date`.
 */
export function extendedSignals(facts: Entry[], date: string, config: SignalConfig = defaultSignalConfig) {
  const signals: ExtendedSignal[] = [];
  const skipped: { type: string; reason: string }[] = [];
  const dates = [...new Set(facts.map((f) => f.snapshot_date))].filter((d) => d <= date).sort();
  if (!dates.includes(date)) return { signals, skipped };
  // Best rank per song per date (a song can chart with more than one recording).
  const rankOn = new Map<string, Map<string, number>>();
  const entryOn = new Map<string, Entry>();
  for (const f of facts) {
    if (f.snapshot_date > date) continue;
    if (!rankOn.has(f.song_id)) rankOn.set(f.song_id, new Map());
    const m = rankOn.get(f.song_id)!;
    if (!m.has(f.snapshot_date) || f.rank < m.get(f.snapshot_date)!) m.set(f.snapshot_date, f.rank);
    if (f.snapshot_date === date) {
      const prev = entryOn.get(f.song_id);
      if (!prev || f.rank < prev.rank) entryOn.set(f.song_id, { ...f });
    }
  }
  const today = [...entryOn.values()].sort((a, b) => a.rank - b.rank || a.song_id.localeCompare(b.song_id));
  const previousDate = dates[dates.indexOf(date) - 1] ?? null;
  const yesterdayIsConsecutive = previousDate === addDays(date, -1);
  const rank = (songId: string, d: string) => rankOn.get(songId)?.get(d);
  // The last n approved dates ending today, only if they are consecutive calendar days.
  const run = (n: number) => {
    const r = dates.slice(Math.max(0, dates.indexOf(date) - n + 1), dates.indexOf(date) + 1);
    if (r.length < n) return null;
    for (let i = 1; i < r.length; i++) if (addDays(r[i - 1], 1) !== r[i]) return null;
    return r;
  };
  const change = (songId: string) => {
    if (!previousDate || !yesterdayIsConsecutive) return null;
    const before = rank(songId, previousDate), now = rank(songId, date);
    return before === undefined || now === undefined ? null : before - now;
  };
  const add = (type: string, e: Entry, severity: ExtendedSignal["severity"], headline: string, explanation: string, extra: Record<string, unknown> = {}, artistId: string | null = e.artist_id) =>
    signals.push({ type, ruleVersion: SIGNALS_V3, entryId: e.entry_id, songId: e.song_id, artistId, severity, headline, explanation, facts: { date, rank: e.rank, ...extra } });

  for (const e of today) {
    const history = [...(rankOn.get(e.song_id) ?? [])].filter(([d]) => d < date);
    // threshold_crossing: first-ever entry inside Top 50/40/20 (highest crossed).
    // Top 10 is the existing new_top_10 signal and is not repeated here.
    const crossed = [...config.thresholds].sort((a, b) => a - b).find((t) => e.rank <= t && !history.some(([, r]) => r <= t));
    if (crossed !== undefined && history.length > 0 && e.rank > 10)
      add("threshold_crossing", e, crossed <= 20 ? "high" : "medium", `${e.title} анх удаа Топ ${crossed}-т орлоо`,
        `${date}: №${e.rank}. Before today its best was №${Math.min(...history.map(([, r]) => r))}; it had never been inside the Top ${crossed}.`, { threshold: crossed });

    // breakout: improved on ≥3 of the last 4 consecutive days, total gain ≥ X, starting outside Top 40.
    const five = run(5);
    if (five) {
      const ranks = five.map((d) => rank(e.song_id, d));
      if (ranks.every((r) => r !== undefined)) {
        const rs = ranks as number[];
        const improved = rs.slice(1).filter((r, i) => r < rs[i]).length;
        const gain = rs[0] - rs[4];
        if (improved >= 3 && gain >= config.breakoutMinGain && rs[0] > config.breakoutStartOutside)
          add("breakout", e, "high", `${e.title} хурдацтай өсөж байна`,
            `Ranks ${five.map((d, i) => `${d.slice(5)} №${rs[i]}`).join(", ")}: up on ${improved} of the last 4 days, ${gain} places in total, from outside the Top ${config.breakoutStartOutside}.`, { ranks: rs, gain });
      }
    }

    // slow_burn: 7-day average rank improves for N consecutive weeks, no single-day jump ≥ jump threshold.
    const weeks = config.slowBurnWeeks + 1;
    const span = run(7 * weeks);
    if (span) {
      const windows = Array.from({ length: weeks }, (_, w) => span.slice(span.length - 7 * (w + 1), span.length - 7 * w));
      const averages = windows.map((win) => {
        const rs = win.map((d) => rank(e.song_id, d)).filter((r): r is number => r !== undefined);
        return rs.length >= config.slowBurnMinDaysPerWeek ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
      });
      const daily = span.map((d) => rank(e.song_id, d));
      const bigJump = daily.some((r, i) => i > 0 && r !== undefined && daily[i - 1] !== undefined && daily[i - 1]! - r >= config.jumpThreshold);
      if (averages.every((a) => a !== null) && averages.slice(0, -1).every((a, i) => a! < averages[i + 1]!) && !bigJump)
        add("slow_burn", e, "medium", `${e.title} аажмаар өгсөж байна`,
          `7-day average rank, newest first: ${averages.map((a) => round(a!)).join(", ")}; no single-day jump of ${config.jumpThreshold}+ places.`, { averages: averages.map((a) => round(a!)) });
    }

    // sudden_revival: an old song climbs ≥ X today, or returns after ≥ N days away better than it left.
    const firstSeen = history[0]?.[0];
    const c = change(e.song_id);
    if (firstSeen && c !== null && c >= config.revivalMinGain && addDays(firstSeen, config.revivalOldDays) <= date)
      add("sudden_revival", e, "medium", `${e.title} эргэн сэргэв`,
        `First charted ${firstSeen}; today up ${c} places to №${e.rank}.`, { firstSeen, gain: c });
    else if (rank(e.song_id, previousDate ?? "") === undefined && history.length > 0) {
      const [lastDate, lastRank] = history[history.length - 1];
      const absent = (Date.parse(date) - Date.parse(lastDate)) / 86_400_000 - 1;
      if (absent >= config.revivalAbsentDays && lastRank - e.rank >= config.revivalMinGain)
        add("sudden_revival", e, "medium", `${e.title} ${absent} хоногийн дараа эргэн орлоо`,
          `Last on the chart ${lastDate} at №${lastRank}; back after ${absent} days at №${e.rank}.`, { lastDate, lastRank, absentDays: absent });
    }

    // resilience: within ±band for N consecutive days while its zone's median daily movement falls.
    const res = run(config.resilienceDays);
    if (res) {
      const rs = res.map((d) => rank(e.song_id, d));
      if (rs.every((r) => r !== undefined) && Math.max(...(rs as number[])) - Math.min(...(rs as number[])) <= config.resilienceBand * 2) {
        const zone = zoneOf(e.rank);
        const moves: number[] = [];
        for (let i = 1; i < res.length; i++)
          for (const [, ranks] of rankOn) {
            const a = ranks.get(res[i - 1]), b = ranks.get(res[i]);
            if (a !== undefined && b !== undefined && zoneOf(a) === zone) moves.push(a - b);
          }
        const zoneMedian = median(moves);
        if (moves.length > 0 && zoneMedian <= config.resilienceZoneFall)
          add("resilience", e, "medium", `${e.title} байраа хадгалж байна`,
            `Ranks over ${res.length} days: ${(rs as number[]).join(", ")}. Median daily move of songs ranked ${zone === "top" ? "1–10" : zone === "middle" ? "11–40" : "41–100"}: ${zoneMedian}.`, { ranks: rs, zoneMedian });
      }
    }

    // high_volatility: 7-day rank standard deviation above the zone threshold.
    const vol = run(config.volatilityDays);
    if (vol) {
      const rs = vol.map((d) => rank(e.song_id, d)).filter((r): r is number => r !== undefined);
      if (rs.length >= Math.ceil(config.volatilityDays * 0.7)) {
        const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
        const sd = Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / rs.length);
        const limit = config.volatilityStdDev[zoneOf(e.rank)];
        if (sd > limit)
          add("high_volatility", e, "medium", `${e.title} байр нь их хэлбэлзэж байна`,
            `Ranks over ${vol.length} days: ${vol.map((d) => rank(e.song_id, d) ?? "—").join(", ")}; standard deviation ${round(sd)} (threshold ${limit} for this zone).`, { standardDeviation: round(sd), threshold: limit });
      }
    }
  }

  // fastest_climber: largest rise as a share of the previous rank (4→2 beats 90→60).
  const climbers = today
    .map((e) => ({ e, c: change(e.song_id), from: previousDate ? rank(e.song_id, previousDate) : undefined }))
    .filter((x): x is { e: Entry; c: number; from: number } => x.c !== null && x.c >= config.fastestMinRise && x.from !== undefined)
    .map((x) => ({ ...x, score: x.c / x.from }))
    .sort((a, b) => b.score - a.score || a.e.rank - b.e.rank);
  if (climbers[0])
    add("fastest_climber", climbers[0].e, "medium", `${climbers[0].e.title} өдрийн хамгийн хурдан өсөлт`,
      `№${climbers[0].from} → №${climbers[0].e.rank}: ${climbers[0].c} places, ${Math.round(climbers[0].score * 100)}% of its previous rank.`, { from: climbers[0].from, gain: climbers[0].c, score: round(climbers[0].score) });

  // Artist-level rules.
  const byArtist = new Map<string, Entry[]>();
  for (const e of today) for (const id of e.artistIds ?? (e.artist_id ? [e.artist_id] : [])) byArtist.set(id, [...(byArtist.get(id) ?? []), e]);
  for (const [artistId, entries] of [...byArtist].sort((a, b) => a[0].localeCompare(b[0]))) {
    const top20 = entries.filter((e) => e.rank <= 20);
    if (top20.length >= config.takeoverTopTwenty || entries.length >= config.takeoverEntries)
      add("artist_takeover", entries[0], "high", `${entries[0].artist}: чартыг эзэлж байна`,
        `${entries.length} songs on the chart, ${top20.length} in the Top 20 (thresholds: ${config.takeoverEntries} songs or ${config.takeoverTopTwenty} in the Top 20).`, { entries: entries.length, topTwenty: top20.length }, artistId);
    const debuts = entries.filter((e) => [...(rankOn.get(e.song_id) ?? [])].every(([d]) => d >= date));
    const olderRising = entries.filter((e) => !debuts.includes(e) && (change(e.song_id) ?? 0) > 0);
    if (debuts.length > 0 && olderRising.length >= config.catalogMinOlderRising)
      add("catalog_effect", debuts[0], "medium", `${debuts[0].artist}: шинэ дуу хуучин дуунуудыг өргөв`,
        `${debuts[0].title} entered at №${debuts[0].rank}; the same day ${olderRising.length} older songs rose: ${olderRising.map((e) => `${e.title} +${change(e.song_id)}`).join(", ")}.`, { olderRising: olderRising.map((e) => e.song_id) }, artistId);
  }

  // international_release_wave: ≥3 tracks of one international album enter or rise together.
  for (const e of today) e.album ??= albumOf(e);
  const withAlbum = today.filter((e) => e.album);
  if (withAlbum.length === 0) skipped.push({ type: "international_release_wave", reason: "no album metadata on today's chart entries" });
  const albums = new Map<string, Entry[]>();
  for (const e of withAlbum)
    if (e.locality === "international" && ((change(e.song_id) ?? 0) > 0 || [...(rankOn.get(e.song_id) ?? [])].every(([d]) => d >= date)))
      albums.set(`${e.artist}\u0000${e.album}`, [...(albums.get(`${e.artist}\u0000${e.album}`) ?? []), e]);
  for (const [, tracks] of [...albums].sort((a, b) => a[0].localeCompare(b[0])))
    if (tracks.length >= config.releaseWaveMinTracks)
      add("international_release_wave", tracks[0], "medium", `${tracks[0].artist} — «${tracks[0].album}» цомгийн давалгаа`,
        `${tracks.length} tracks from ${tracks[0].album} entered or rose today: ${tracks.map((t) => `${t.title} №${t.rank}`).join(", ")}.`, { album: tracks[0].album, tracks: tracks.map((t) => t.song_id) });

  return {
    signals: signals.sort((a, b) => a.type.localeCompare(b.type) || (a.facts.rank as number) - (b.facts.rank as number) || a.songId.localeCompare(b.songId)),
    skipped,
  };
}
