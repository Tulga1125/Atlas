import { z } from "zod";

export const factSchema = z.object({
  entry_id: z.string(),
  snapshot_id: z.string(),
  snapshot_date: z.iso.date(),
  song_id: z.string(),
  platform_asset_id: z.string(),
  rank: z.number().int().min(1).max(100),
  artist_id: z.string().nullable(),
  title: z.string(),
  artist: z.string(),
  locality: z.string(),
  artistIds: z.array(z.string()).optional(),
});
export type Fact = z.infer<typeof factSchema>;
export const configurationSchema = z.object({
  dailyWeight: z.number().nonnegative(),
  weeklyWeight: z.number().nonnegative(),
  positionWeight: z.number().nonnegative(),
  streakWeight: z.number().nonnegative(),
  peakWeight: z.number().nonnegative(),
  dailyCap: z.number().positive(),
  weeklyCap: z.number().positive(),
  streakCap: z.number().positive(),
  jumpThreshold: z.number().positive(),
  replacementThreshold: z.number().min(0).max(1),
});
export const defaultConfiguration = configurationSchema.parse({
  dailyWeight: 0.3,
  weeklyWeight: 0.25,
  positionWeight: 0.2,
  streakWeight: 0.15,
  peakWeight: 0.1,
  dailyCap: 25,
  weeklyCap: 50,
  streakCap: 7,
  jumpThreshold: 20,
  replacementThreshold: 0.4,
});
export type Configuration = z.infer<typeof configurationSchema>;
export const formulaVersion = "chart-metrics-v2";
export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function weekOf(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftDate(date, -(day === 0 ? 6 : day - 1));
}
const round = (value: number) => Math.round(value * 100) / 100;
export function calculateChart(
  allFacts: Fact[],
  snapshotId: string,
  config: Configuration = defaultConfiguration,
) {
  const current = allFacts
    .filter((f) => f.snapshot_id === snapshotId)
    .sort((a, b) => a.rank - b.rank);
  if (!current.length) throw new Error("Snapshot has no chart facts");
  const date = current[0].snapshot_date;
  const facts = allFacts.filter((f) => f.snapshot_date <= date);
  const dates = [...new Set(facts.map((f) => f.snapshot_date))].sort();
  const previousDate = dates.filter((d) => d < date).at(-1) ?? null;
  const previous = facts.filter((f) => f.snapshot_date === previousDate);
  const bySong = new Map<string, Map<string, Fact>>();
  for (const f of facts) {
    const history = bySong.get(f.song_id) ?? new Map<string, Fact>();
    if (
      !history.has(f.snapshot_date) ||
      history.get(f.snapshot_date)!.rank > f.rank
    )
      history.set(f.snapshot_date, f);
    bySong.set(f.song_id, history);
  }
  const metrics = current.map((entry) => {
    const history = bySong.get(entry.song_id)!;
    const past = [...history.values()].filter((f) => f.snapshot_date < date);
    const previousRank = previousDate
      ? (history.get(previousDate)?.rank ?? null)
      : null;
    const rank7dAgo = history.get(shiftDate(date, -7))?.rank ?? null;
    const rankChange = previousRank === null ? null : previousRank - entry.rank;
    const weeklyRankChange = rank7dAgo === null ? null : rank7dAgo - entry.rank;
    const entryStatus = !past.length
      ? "new"
      : previousRank === null
        ? "re_entry"
        : rankChange! > 0
          ? "up"
          : rankChange! < 0
            ? "down"
            : "unchanged";
    const priorPeak = past.length ? Math.min(...past.map((f) => f.rank)) : null;
    let consecutiveDays = 0,
      gainStreak = 0;
    for (let d = date; history.has(d); d = shiftDate(d, -1)) consecutiveDays++;
    for (
      let d = date;
      history.has(d) &&
      history.has(shiftDate(d, -1)) &&
      history.get(d)!.rank < history.get(shiftDate(d, -1))!.rank;
      d = shiftDate(d, -1)
    )
      gainStreak++;
    const rolling = [...history.values()]
      .filter((f) => f.snapshot_date >= shiftDate(date, -6))
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
    const ranks = rolling.map((f) => f.rank);
    const mean = ranks.reduce((sum, r) => sum + r, 0) / ranks.length;
    const newPeak = priorPeak !== null && entry.rank < priorPeak;
    const components: Array<[number, number | null]> = [
      [
        config.dailyWeight,
        rankChange === null
          ? null
          : Math.min(Math.max(rankChange, 0) / config.dailyCap, 1),
      ],
      [
        config.weeklyWeight,
        weeklyRankChange === null
          ? null
          : Math.min(Math.max(weeklyRankChange, 0) / config.weeklyCap, 1),
      ],
      [config.positionWeight, (101 - entry.rank) / 100],
      [config.streakWeight, Math.min(gainStreak / config.streakCap, 1)],
      [config.peakWeight, priorPeak === null ? null : newPeak ? 1 : 0],
    ];
    const available = components.filter(
      (c): c is [number, number] => c[1] !== null,
    );
    const weight = available.reduce((sum, [w]) => sum + w, 0);
    const twoDaysAgo = history.get(shiftDate(date, -2));
    const yesterday = history.get(shiftDate(date, -1));
    const velocity =
      rolling.length < 2
        ? null
        : (rolling[0].rank - entry.rank) /
          ((Date.parse(date) - Date.parse(rolling[0].snapshot_date)) /
            86400000);
    return {
      entryId: entry.entry_id,
      songId: entry.song_id,
      rank: entry.rank,
      previousDate,
      previousRank,
      rankChange,
      entryStatus,
      rank7dAgo,
      weeklyRankChange,
      peakRank: Math.min(entry.rank, ...past.map((f) => f.rank)),
      daysOnChart: history.size,
      weeksOnChart: new Set([...history.keys()].map(weekOf)).size,
      consecutiveDays,
      gainStreak,
      newPeak,
      firstChartDate: [...history.keys()].sort()[0],
      top10Days: [...history.values()].filter((f) => f.rank <= 10).length,
      top40Days: [...history.values()].filter((f) => f.rank <= 40).length,
      averageRank: round(
        [...history.values()].reduce((sum, f) => sum + f.rank, 0) /
          history.size,
      ),
      rolling7dAverageRank: round(mean),
      rollingCoverage: ranks.length,
      volatility:
        ranks.length < 2
          ? null
          : round(
              Math.sqrt(
                ranks.reduce((sum, r) => sum + (r - mean) ** 2, 0) /
                  ranks.length,
              ),
            ),
      velocity: velocity === null ? null : round(velocity),
      acceleration:
        yesterday && twoDaysAgo
          ? yesterday.rank - entry.rank - (twoDaysAgo.rank - yesterday.rank)
          : null,
      momentumScore: weight
        ? round(
            (100 * available.reduce((sum, [w, v]) => sum + w * v, 0)) / weight,
          )
        : 0,
      incompleteHistory: components.some(([, v]) => v === null),
    };
  });
  type Signal = {
    type: string;
    entryId: string;
    songId: string;
    artistId: string | null;
    severity: "medium" | "high";
    headline: string;
    explanation: string;
    metrics: (typeof metrics)[number];
  };
  const signals: Signal[] = [];
  const canonical = current.filter(
    (e, i) => current.findIndex((f) => f.song_id === e.song_id) === i,
  );
  const newEntries = metrics.filter((m) => m.entryStatus === "new");
  const add = (
    type: string,
    entry: Fact,
    headline: string,
    severity: "medium" | "high" = "medium",
    artistId: string | null = entry.artist_id,
  ) => {
    const metric = metrics.find((m) => m.entryId === entry.entry_id)!;
    signals.push({
      type,
      entryId: entry.entry_id,
      songId: entry.song_id,
      artistId,
      severity,
      headline,
      explanation: `${date}: №${entry.rank}. ${previousDate ?? "—"}: ${metric.previousRank === null ? "—" : `№${metric.previousRank}`}. ${formulaVersion}.`,
      metrics: metric,
    });
  };
  for (const entry of canonical) {
    const m = metrics.find((m) => m.entryId === entry.entry_id)!;
    if (
      entry.rank === 1 &&
      previous.find((f) => f.rank === 1)?.song_id !== entry.song_id
    )
      add("new_number_one", entry, `${entry.title} №1-д хүрлээ`, "high");
    if (m.entryStatus === "new")
      add("new_entry", entry, `${entry.title} чартад шинээр орлоо`);
    if (m.entryStatus === "re_entry")
      add("re_entry", entry, `${entry.title} чартад эргэн орлоо`);
    if (newEntries[0]?.entryId === entry.entry_id)
      add(
        "highest_new_entry",
        entry,
        `${entry.title} шинэ дуунуудыг тэргүүллээ`,
        "high",
      );
    if ((m.rankChange ?? 0) >= config.jumpThreshold)
      add(
        "rank_jump_20",
        entry,
        `${entry.title} ${m.rankChange} байр өсөв`,
        entry.rank <= 20 ? "high" : "medium",
      );
    if ((m.rankChange ?? 0) <= -config.jumpThreshold)
      add(
        "rank_drop_20",
        entry,
        `${entry.title} ${Math.abs(m.rankChange!)} байр буурав`,
      );
    if (m.newPeak)
      add("new_peak", entry, `${entry.title} бүртгэгдсэн шинэ оргилд хүрлээ`);
    if (m.gainStreak === 3)
      add(
        "three_day_gain_streak",
        entry,
        `${entry.title} гурван өдөр дараалан өсөв`,
      );
    const past = [...bySong.get(entry.song_id)!.values()].filter(
      (f) => f.snapshot_date < date,
    );
    if (entry.rank <= 10 && !past.some((f) => f.rank <= 10))
      add(
        "new_top_10",
        entry,
        `${entry.title} анх удаа Топ 10-т орлоо`,
        "high",
      );
    if (entry.locality === "local" && m.newPeak && entry.rank <= 40)
      add(
        "local_new_peak",
        entry,
        `${entry.title} — Монгол дууны шинэ оргил`,
        "high",
      );
  }
  const artistIds = [
    ...new Set(
      canonical.flatMap(
        (e) => e.artistIds ?? (e.artist_id ? [e.artist_id] : []),
      ),
    ),
  ];
  const artists = artistIds.map((id) => {
    const entries = canonical.filter((e) =>
      (e.artistIds ?? (e.artist_id ? [e.artist_id] : [])).includes(id),
    );
    const artistMetrics = entries.map(
      (e) => metrics.find((m) => m.entryId === e.entry_id)!,
    );
    if (artistMetrics.filter((m) => m.entryStatus === "new").length >= 3)
      add(
        "artist_multi_entry",
        entries[0],
        `${entries[0].artist}: гурван шинэ дуу чартад орлоо`,
        "high",
        id,
      );
    return {
      artistId: id,
      chartingSongs: entries.length,
      bestRank: Math.min(...entries.map((e) => e.rank)),
      positionPoints: entries.reduce((sum, e) => sum + 101 - e.rank, 0),
      momentum: round(
        artistMetrics.reduce((sum, m) => sum + m.momentumScore, 0) /
          entries.length,
      ),
    };
  });
  signals.sort(
    (a, b) =>
      (a.severity === "high" ? 0 : 1) - (b.severity === "high" ? 0 : 1) ||
      a.metrics.rank - b.metrics.rank ||
      a.type.localeCompare(b.type),
  );
  const replacementShare = previous.length
    ? canonical.filter((e) => !previous.some((p) => p.song_id === e.song_id))
        .length / canonical.length
    : 0;
  const summary = {
    date,
    previousDate,
    gapDays: previousDate
      ? (Date.parse(date) - Date.parse(previousDate)) / 86400000 - 1
      : 0,
    newEntries: newEntries.length,
    reEntries: metrics.filter((m) => m.entryStatus === "re_entry").length,
    exits: previous
      .filter((e) => !current.some((c) => c.song_id === e.song_id))
      .map((e) => e.song_id),
    localEntries: current.filter((e) => e.locality === "local").length,
    artists,
    replacementShare,
    massReplacement:
      previous.length > 0 && replacementShare > config.replacementThreshold,
  };
  const brief = `Apple Music Mongolia · ${date}\n№1: ${current[0].title} — ${current[0].artist}\nШинэ дуу: ${summary.newEntries}. Эргэн орсон: ${summary.reEntries}. Монгол дуу: ${summary.localEntries}.\n${summary.gapDays ? `Өгөгдөл дутуу: ${summary.gapDays} өдөр.\n` : ""}${signals
    .slice(0, 10)
    .map((s) => `${s.headline}\n${s.explanation}`)
    .join("\n\n")}`;
  return {
    metrics,
    signals,
    summary,
    brief,
    inputs: {
      snapshotIds: [...new Set(facts.map((f) => f.snapshot_id))].sort(),
      configuration: config,
    },
  };
}
