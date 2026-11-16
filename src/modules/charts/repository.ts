import "server-only";

import { z } from "zod";
import { createPublicDataClient } from "@/lib/supabase/public-data";
import { chartEntryStatuses, type ChartSnapshot } from "./types";

const CHART_SLUG = "apple-music-mongolia";
const databaseUuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const chartRowSchema = z.object({
  id: databaseUuid,
  name: z.string().min(1),
});

const snapshotRowSchema = z.object({
  id: databaseUuid,
  snapshot_date: z.iso.date(),
  collected_at: z.iso.datetime({ offset: true }),
  source_timestamp: z.iso.datetime({ offset: true }).nullable(),
  status: z.literal("approved"),
  entry_count: z.number().int().positive(),
});

const entryRowSchema = z.object({
  id: databaseUuid.optional(),
  rank: z.number().int().positive(),
  previous_rank: z.number().int().positive().nullable(),
  rank_change: z.number().int().nullable(),
  entry_status: z.enum(chartEntryStatuses),
  peak_rank: z.number().int().positive(),
  days_on_chart: z.number().int().positive(),
  momentum_score: z.coerce.number().min(0).max(100),
  song_id: databaseUuid,
  platform_asset_id: databaseUuid,
});

const songRowSchema = z.object({
  id: databaseUuid,
  canonical_title: z.string().min(1),
  primary_artist_id: databaseUuid.nullable(),
  artwork_url: z.url().nullable(),
  locality: z.enum(["local", "international", "mixed", "unknown"]),
});

const artistRowSchema = z.object({
  id: databaseUuid,
  canonical_name: z.string().min(1),
  locality: z.enum(["local", "international", "mixed", "unknown"]),
});

const assetRowSchema = z.object({
  id: databaseUuid,
  platform_url: z.url().nullable(),
  artwork_url: z.url().nullable(),
  platform_artist_name: z.string().min(1),
});

export const liveChartRowsSchema = z.object({
  chart: chartRowSchema,
  snapshot: snapshotRowSchema,
  entries: z.array(entryRowSchema),
  songs: z.array(songRowSchema),
  artists: z.array(artistRowSchema),
  assets: z.array(assetRowSchema),
});

export type LiveChartRows = z.infer<typeof liveChartRowsSchema>;

export class ChartDataError extends Error {
  constructor(
    public readonly code:
      | "not_configured"
      | "not_found"
      | "query_failed"
      | "integrity_failed",
    message: string,
  ) {
    super(message);
    this.name = "ChartDataError";
  }
}

export function assembleLiveChartSnapshot(input: LiveChartRows): ChartSnapshot {
  const parsed = liveChartRowsSchema.parse(input);
  const songs = new Map(parsed.songs.map((song) => [song.id, song]));
  const artists = new Map(parsed.artists.map((artist) => [artist.id, artist]));
  const assets = new Map(parsed.assets.map((asset) => [asset.id, asset]));

  if (parsed.entries.length !== parsed.snapshot.entry_count) {
    throw new ChartDataError(
      "integrity_failed",
      `Approved snapshot expected ${parsed.snapshot.entry_count} entries but returned ${parsed.entries.length}.`,
    );
  }

  const entries = parsed.entries.map((entry) => {
    const song = songs.get(entry.song_id);
    const asset = assets.get(entry.platform_asset_id);

    if (!song || !asset) {
      throw new ChartDataError(
        "integrity_failed",
        `Rank ${entry.rank} is missing its catalog or source asset.`,
      );
    }

    const artist = song.primary_artist_id
      ? artists.get(song.primary_artist_id)
      : undefined;

    return {
      rank: entry.rank,
      previousRank: entry.previous_rank,
      rankChange: entry.rank_change,
      entryStatus: entry.entry_status,
      songId: entry.song_id,
      title: song.canonical_title,
      artist: artist?.canonical_name ?? asset.platform_artist_name,
      artworkUrl: song.artwork_url ?? asset.artwork_url,
      sourceUrl: asset.platform_url,
      peakRank: entry.peak_rank,
      daysOnChart: entry.days_on_chart,
      isLocal: song.locality === "local" || artist?.locality === "local",
      momentumScore: entry.momentum_score,
      sourceAssetId: entry.platform_asset_id,
    };
  });

  entries.sort((left, right) => left.rank - right.rank);

  return {
    id: parsed.snapshot.id,
    chartId: parsed.chart.id,
    chartName: parsed.chart.name,
    date: parsed.snapshot.snapshot_date,
    collectedAt: parsed.snapshot.collected_at,
    sourceTimestamp: parsed.snapshot.source_timestamp,
    status: parsed.snapshot.status,
    entryCount: parsed.snapshot.entry_count,
    isDemo: false,
    entries,
  };
}

function queryFailure(label: string, message: string) {
  return new ChartDataError("query_failed", `${label}: ${message}`);
}

export async function getLatestApprovedChartSnapshot(
  snapshotDate?: string,
): Promise<ChartSnapshot | null> {
  const supabase = createPublicDataClient();

  const { data: chartData, error: chartError } = await supabase
    .from("charts")
    .select("id,name")
    .eq("slug", CHART_SLUG)
    .eq("active", true)
    .single();

  if (chartError) {
    throw queryFailure("Unable to load chart", chartError.message);
  }

  const chart = chartRowSchema.parse(chartData);
  let snapshotQuery = supabase
    .from("chart_snapshots")
    .select("id,snapshot_date,collected_at,source_timestamp,status,entry_count")
    .eq("chart_id", chart.id)
    .eq("status", "approved");

  snapshotQuery = snapshotDate
    ? snapshotQuery.eq("snapshot_date", snapshotDate)
    : snapshotQuery.order("snapshot_date", { ascending: false }).limit(1);

  const { data: snapshotData, error: snapshotError } =
    await snapshotQuery.maybeSingle();

  if (snapshotError) {
    throw queryFailure("Unable to load snapshot", snapshotError.message);
  }

  if (!snapshotData) {
    return null;
  }

  const snapshot = snapshotRowSchema.parse(snapshotData);
  const { data: entryData, error: entryError } = await supabase
    .from("chart_entries")
    .select(
      "id,rank,previous_rank,rank_change,entry_status,peak_rank,days_on_chart,momentum_score,song_id,platform_asset_id",
    )
    .eq("snapshot_id", snapshot.id)
    .order("rank", { ascending: true });

  if (entryError) {
    throw queryFailure("Unable to load chart entries", entryError.message);
  }

  const entries = z.array(entryRowSchema).parse(entryData);
  const [factResponse, metricResponse] = await Promise.all([
    supabase
      .from("chart_facts")
      .select("entry_id,song_id")
      .eq("snapshot_id", snapshot.id),
    supabase
      .from("current_chart_metrics")
      .select("entry_id,metrics,formula_version")
      .eq("snapshot_id", snapshot.id),
  ]);
  if (factResponse.error || metricResponse.error)
    throw queryFailure(
      "Unable to load versioned chart",
      factResponse.error?.message ?? metricResponse.error!.message,
    );
  for (const entry of entries) {
    const fact = factResponse.data?.find((f) => f.entry_id === entry.id);
    if (fact?.song_id) entry.song_id = fact.song_id;
    const derived = metricResponse.data?.find(
      (m) => m.entry_id === entry.id,
    )?.metrics;
    if (derived) {
      const metrics = z
        .object({
          previousRank: z.number().nullable(),
          rankChange: z.number().nullable(),
          entryStatus: z.enum(chartEntryStatuses),
          peakRank: z.number(),
          daysOnChart: z.number(),
          momentumScore: z.number(),
        })
        .parse(derived);
      Object.assign(entry, {
        previous_rank: metrics.previousRank,
        rank_change: metrics.rankChange,
        entry_status: metrics.entryStatus,
        peak_rank: metrics.peakRank,
        days_on_chart: metrics.daysOnChart,
        momentum_score: metrics.momentumScore,
      });
    }
  }
  const songIds = [...new Set(entries.map((entry) => entry.song_id))];
  const assetIds = [
    ...new Set(entries.map((entry) => entry.platform_asset_id)),
  ];

  const [songResponse, assetResponse] = await Promise.all([
    supabase
      .from("songs")
      .select("id,canonical_title,primary_artist_id,artwork_url,locality")
      .in("id", songIds),
    supabase
      .from("platform_assets")
      .select("id,platform_url,artwork_url,platform_artist_name")
      .in("id", assetIds),
  ]);

  if (songResponse.error) {
    throw queryFailure(
      "Unable to load song catalog",
      songResponse.error.message,
    );
  }

  if (assetResponse.error) {
    throw queryFailure(
      "Unable to load source assets",
      assetResponse.error.message,
    );
  }

  const songs = z.array(songRowSchema).parse(songResponse.data);
  const artistIds = [
    ...new Set(
      songs.flatMap((song) =>
        song.primary_artist_id ? [song.primary_artist_id] : [],
      ),
    ),
  ];

  const artistResponse = artistIds.length
    ? await supabase
        .from("artists")
        .select("id,canonical_name,locality")
        .in("id", artistIds)
    : { data: [], error: null };

  if (artistResponse.error) {
    throw queryFailure(
      "Unable to load artist catalog",
      artistResponse.error.message,
    );
  }

  const assembled = assembleLiveChartSnapshot({
    chart,
    snapshot,
    entries,
    songs,
    artists: z.array(artistRowSchema).parse(artistResponse.data),
    assets: z.array(assetRowSchema).parse(assetResponse.data),
  });
  assembled.formulaVersion =
    metricResponse.data?.[0]?.formula_version ?? "apple-music-rank-v1";
  assembled.calculationPending =
    metricResponse.data?.length !== snapshot.entry_count;
  assembled.entries = assembled.entries.map((entry) => {
    const row = entries.find((e) => e.rank === entry.rank);
    const derived = metricResponse.data?.find(
      (m) => m.entry_id === row?.id,
    )?.metrics;
    if (!derived) return entry;
    const extra = z
      .object({
        weeklyRankChange: z.number().nullable(),
        consecutiveDays: z.number(),
      })
      .parse(derived);
    return { ...entry, ...extra, formulaVersion: assembled.formulaVersion };
  });
  return assembled;
}
