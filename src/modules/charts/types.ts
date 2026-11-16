export const chartEntryStatuses = [
  "new",
  "re_entry",
  "up",
  "down",
  "unchanged",
] as const;

export type ChartEntryStatus = (typeof chartEntryStatuses)[number];

export type ChartEntry = {
  rank: number;
  previousRank: number | null;
  rankChange: number | null;
  entryStatus: ChartEntryStatus;
  songId: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  sourceUrl: string | null;
  peakRank: number;
  daysOnChart: number;
  isLocal: boolean;
  momentumScore: number;
  weeklyRankChange?: number | null;
  consecutiveDays?: number;
  formulaVersion?: string;
  sourceAssetId?: string;
};

export type ChartSnapshot = {
  id: string;
  chartId: string;
  chartName: string;
  date: string;
  collectedAt: string;
  sourceTimestamp: string | null;
  status: "approved" | "candidate" | "rejected" | "replaced";
  entryCount: number;
  isDemo: boolean;
  entries: ChartEntry[];
  formulaVersion?: string;
  calculationPending?: boolean;
};

export type ChartSummary = {
  numberOneChanged: boolean;
  newEntries: number;
  reEntries: number;
  localEntries: number;
  risingEntries: number;
  biggestGainer: ChartEntry | null;
};
