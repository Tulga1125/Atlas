import type { ChartSnapshot } from "./types";
import { summarizeChart } from "./summary";

export function toPublicChartResponse(snapshot: ChartSnapshot) {
  return {
    chart: {
      id: snapshot.chartId,
      name: snapshot.chartName,
      source: "apple_music",
    },
    snapshot: {
      id: snapshot.id,
      date: snapshot.date,
      collectedAt: snapshot.collectedAt,
      sourceTimestamp: snapshot.sourceTimestamp,
      status: snapshot.status,
      entryCount: snapshot.entryCount,
      isDemo: snapshot.isDemo,
      formulaVersion: snapshot.formulaVersion ?? "preview",
      calculationPending: snapshot.calculationPending ?? false,
    },
    summary: summarizeChart(snapshot),
    entries: snapshot.entries,
  };
}

function escapeCsvCell(value: string | number | null) {
  if (value === null) {
    return "";
  }

  // Spreadsheet applications interpret these prefixes even inside quoted cells.
  const raw = String(value);
  const stringValue =
    typeof value === "string" && /^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/.test(raw)
      ? `'${raw}`
      : raw;
  return /[",\r\n]/.test(stringValue)
    ? `"${stringValue.replaceAll('"', '""')}"`
    : stringValue;
}

export function toChartCsv(snapshot: ChartSnapshot) {
  const header = [
    "rank",
    "title",
    "artist",
    "previous_rank",
    "rank_change",
    "status",
    "peak_rank",
    "days_on_chart",
    "local",
    "source_url",
    "snapshot_date",
  ];

  const rows = snapshot.entries.map((entry) =>
    [
      entry.rank,
      entry.title,
      entry.artist,
      entry.previousRank,
      entry.rankChange,
      entry.entryStatus,
      entry.peakRank,
      entry.daysOnChart,
      entry.isLocal ? "yes" : "no",
      entry.sourceUrl,
      snapshot.date,
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  return [header.join(","), ...rows].join("\r\n");
}
