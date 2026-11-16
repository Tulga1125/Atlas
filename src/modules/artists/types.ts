export type ArtistChartStats = {
  firstChartDate: string | null;
  latestChartDate: string | null;
  chartingDays: number;
  songsCharted: number;
  peakRank: number | null;
  topTenEntryDays: number;
  numberOneEntryDays: number;
  totalEntryDays: number;
};

export type ArtistMetric = {
  platformCode: string;
  platformName: string;
  metricDate: string;
  name: "subscribers" | "total_views" | "video_count";
  value: number;
  unit: "people" | "views" | "videos";
  scope: string;
};

export type ArtistProfileLink = {
  platformCode: string;
  platformName: string;
  url: string;
};

export type ArtistSummary = {
  id: string;
  name: string;
  imageUrl: string | null;
  biography: string | null;
  genres: string[];
  currentBestRank: number | null;
  currentChartingSongs: number;
  stats: ArtistChartStats;
  metrics: ArtistMetric[];
  profiles: ArtistProfileLink[];
};

export type ArtistChartSong = {
  id: string;
  title: string;
  currentRank: number | null;
  peakRank: number;
  daysOnChart: number;
};

export type ArtistDetail = ArtistSummary & {
  currentSongs: ArtistChartSong[];
};
