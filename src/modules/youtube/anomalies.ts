import { z } from "zod";
import type { StatsRow } from "./stats";

// A6: YouTube data-quality anomalies (`yt-anomalies-v1`). Pure rules over one
// collection day; each anomaly carries severity, evidence and rule version.
// They go to the Anomaly Center for review; none changes data by itself.

export const YT_ANOMALIES = "yt-anomalies-v1";

export const anomalyConfigSchema = z.object({
  jumpShare: z.number().positive().default(0.4),
  jumpMinAgeDays: z.number().int().nonnegative().default(365),
  partialShare: z.number().min(0).max(1).default(0.2),
  methodologyBreaks: z.array(z.object({ date: z.string(), scope: z.string() })).default([
    { date: "2025-03-31", scope: "shorts" },
    { date: "2026-08-27", scope: "all" },
  ]),
});
export type AnomalyConfig = z.infer<typeof anomalyConfigSchema>;
export const defaultAnomalyConfig = anomalyConfigSchema.parse({});

export type YouTubeAnomaly = {
  type:
    | "yt_view_count_decrease"
    | "yt_implausible_jump"
    | "yt_video_unavailable"
    | "yt_asset_conflict"
    | "yt_stale_payload"
    | "yt_partial_collection"
    | "yt_methodology_break";
  severity: "low" | "medium" | "high";
  videoId: string | null;
  summary: string;
  expected: Record<string, unknown> | null;
  observed: Record<string, unknown> | null;
  evidence: Record<string, unknown>;
  ruleVersion: string;
};

export type DayInput = {
  date: string;
  rows: StatsRow[];
  /** Last approved observation per video before this date. */
  previous: Map<string, { date: string; views: number; availability: "available" }>;
  publishedAt: Map<string, string>;
  /** Songs with more than one primary video, and primaries changed today. */
  primaryConflicts: { songId: string; videoIds: string[] }[];
  primaryChanges: { songId: string; from: string | null; to: string }[];
  stale: boolean;
};

export function detectAnomalies(input: DayInput, config: AnomalyConfig = defaultAnomalyConfig): YouTubeAnomaly[] {
  const out: YouTubeAnomaly[] = [];
  const add = (a: Omit<YouTubeAnomaly, "ruleVersion">) => out.push({ ...a, ruleVersion: YT_ANOMALIES, evidence: { date: input.date, ...a.evidence } });

  for (const row of [...input.rows].sort((a, b) => a.videoId.localeCompare(b.videoId))) {
    const prev = input.previous.get(row.videoId);
    if (row.availability !== "available") {
      if (prev)
        add({ type: "yt_video_unavailable", severity: "medium", videoId: row.videoId,
          summary: `Video ${row.videoId} is ${row.availability === "private" ? "private" : "no longer returned (deleted, private or region-blocked)"}`,
          expected: { availability: "available", lastSeen: prev.date }, observed: { availability: row.availability }, evidence: { videoId: row.videoId } });
      continue;
    }
    if (!prev) continue;
    const views = Number(row.viewCount);
    if (views < prev.views)
      add({ type: "yt_view_count_decrease", severity: "medium", videoId: row.videoId,
        summary: `View count of ${row.videoId} fell from ${prev.views} to ${views}`,
        expected: { minimumViews: prev.views }, observed: { views }, evidence: { videoId: row.videoId, previousDate: prev.date } });
    const published = input.publishedAt.get(row.videoId);
    const ageDays = published ? Math.floor((Date.parse(input.date) - Date.parse(published)) / 86_400_000) : null;
    const gain = views - prev.views;
    if (ageDays !== null && ageDays >= config.jumpMinAgeDays && prev.views > 0 && gain / prev.views > config.jumpShare)
      add({ type: "yt_implausible_jump", severity: "high", videoId: row.videoId,
        summary: `${row.videoId}, ${ageDays} days old, gained ${Math.round((gain / prev.views) * 100)}% of its lifetime views in one observation`,
        expected: { maximumShare: config.jumpShare }, observed: { gain, previousViews: prev.views, share: Math.round((gain / prev.views) * 1000) / 1000 },
        evidence: { videoId: row.videoId, ageDays, previousDate: prev.date } });
  }

  for (const c of input.primaryConflicts)
    add({ type: "yt_asset_conflict", severity: "high", videoId: null, summary: `Song ${c.songId} has ${c.videoIds.length} primary YouTube videos`,
      expected: { primaryVideos: 1 }, observed: { primaryVideos: c.videoIds.length }, evidence: { songId: c.songId, videoIds: c.videoIds } });
  for (const c of input.primaryChanges)
    add({ type: "yt_asset_conflict", severity: "low", videoId: c.to, summary: `Primary YouTube video of song ${c.songId} changed`,
      expected: c.from ? { primary: c.from } : null, observed: { primary: c.to }, evidence: { songId: c.songId, from: c.from, to: c.to } });

  if (input.stale)
    add({ type: "yt_stale_payload", severity: "high", videoId: null, summary: "Every tracked video has exactly the previous day's counts",
      expected: null, observed: { videos: input.rows.length }, evidence: {} });

  const missing = input.rows.filter((r) => r.availability !== "available").length;
  if (input.rows.length > 0 && missing / input.rows.length > config.partialShare)
    add({ type: "yt_partial_collection", severity: "high", videoId: null,
      summary: `${missing} of ${input.rows.length} watchlist videos were not collected`,
      expected: { maximumMissingShare: config.partialShare }, observed: { missing, requested: input.rows.length }, evidence: {} });

  for (const b of config.methodologyBreaks)
    if (b.date === input.date)
      add({ type: "yt_methodology_break", severity: "low", videoId: null,
        summary: `YouTube changed how ${b.scope === "all" ? "all" : b.scope} views are counted from today; comparisons across this date mix methods`,
        expected: null, observed: null, evidence: { scope: b.scope } });

  return out;
}
