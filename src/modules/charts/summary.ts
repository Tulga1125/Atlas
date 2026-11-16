import type { ChartSnapshot, ChartSummary } from "./types";

export function summarizeChart(snapshot: ChartSnapshot): ChartSummary {
  const biggestGainer = snapshot.entries
    .filter((entry) => (entry.rankChange ?? 0) > 0)
    .sort((a, b) => (b.rankChange ?? 0) - (a.rankChange ?? 0))[0] ?? null;

  return {
    numberOneChanged: snapshot.entries[0]?.previousRank !== 1,
    newEntries: snapshot.entries.filter((entry) => entry.entryStatus === "new").length,
    reEntries: snapshot.entries.filter((entry) => entry.entryStatus === "re_entry").length,
    localEntries: snapshot.entries.filter(
      (entry) => entry.rank <= 10 && entry.isLocal,
    ).length,
    risingEntries: snapshot.entries.filter((entry) => entry.entryStatus === "up").length,
    biggestGainer,
  };
}
