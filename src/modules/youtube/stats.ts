import { createHash } from "node:crypto";
import { z } from "zod";
import { parseDuration } from "./video";
import type { YouTubeClient } from "./discovery";

// Daily YouTube statistics (A3). Pure normalisation and validation; the
// database (complete_youtube_stats) re-checks every rule and is the authority.

const count = z.string().regex(/^\d+$/);
const itemSchema = z
  .object({
    id: z.string(),
    snippet: z.object({ title: z.string(), channelTitle: z.string().optional(), publishedAt: z.string().optional() }).passthrough().optional(),
    statistics: z
      .object({ viewCount: count.optional(), likeCount: count.optional(), commentCount: count.optional() })
      .passthrough()
      .optional(),
    status: z.object({ privacyStatus: z.string().optional() }).passthrough().optional(),
    contentDetails: z.object({ duration: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

export type StatsRow =
  | {
      videoId: string;
      availability: "available";
      viewCount: string;
      likeCount: string | null;
      commentCount: string | null;
      title?: string;
      channelTitle?: string;
      publishedAt?: string;
      durationSeconds?: number | null;
    }
  | { videoId: string; availability: "missing" | "private" };

export class StatsValidationError extends Error {}

/**
 * One row per requested video. The API omits deleted videos (and private ones,
 * with an API key), so an unanswered ID is recorded as missing. Counts must be
 * non-negative integers; an item without a view count is a validation error.
 */
export function normalizeStats(items: unknown[], requested: string[]): StatsRow[] {
  const answered = new Map<string, z.infer<typeof itemSchema>>();
  for (const raw of items) {
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) throw new StatsValidationError("YouTube returned a malformed or negative count");
    answered.set(parsed.data.id, parsed.data);
  }
  return [...new Set(requested)].sort().map((videoId): StatsRow => {
    const item = answered.get(videoId);
    if (!item) return { videoId, availability: "missing" };
    if (item.status?.privacyStatus === "private") return { videoId, availability: "private" };
    if (!item.statistics?.viewCount) throw new StatsValidationError(`No view count for ${videoId}`);
    return {
      videoId,
      availability: "available",
      viewCount: item.statistics.viewCount,
      likeCount: item.statistics.likeCount ?? null,
      commentCount: item.statistics.commentCount ?? null,
      title: item.snippet?.title,
      channelTitle: item.snippet?.channelTitle,
      publishedAt: item.snippet?.publishedAt,
      durationSeconds: parseDuration(item.contentDetails?.duration),
    };
  });
}

/** Videos whose view count fell below the last approved value (shown before storing). */
export function viewDecreases(rows: StatsRow[], lastApproved: Map<string, number>) {
  return rows
    .filter((r): r is Extract<StatsRow, { availability: "available" }> => r.availability === "available")
    .filter((r) => lastApproved.has(r.videoId) && Number(r.viewCount) < lastApproved.get(r.videoId)!)
    .map((r) => ({ videoId: r.videoId, previous: lastApproved.get(r.videoId)!, observed: Number(r.viewCount) }));
}

/**
 * A payload is stale when every video's counts equal the previous day's
 * exactly; one identical day across a whole catalogue means YouTube served old
 * data or nothing was collected. Compared on counts, not on the raw body.
 */
export function statsFingerprint(rows: StatsRow[]) {
  const counts = rows.map((r) => (r.availability === "available" ? `${r.videoId}:${r.viewCount}:${r.likeCount}:${r.commentCount}` : `${r.videoId}:${r.availability}`));
  return createHash("sha256").update(counts.join("\n")).digest("hex");
}

export async function collectStats(client: YouTubeClient, videoIds: string[]) {
  const items = videoIds.length ? await client.statistics([...new Set(videoIds)].sort()) : [];
  const rows = normalizeStats(items, videoIds);
  const rawBody = JSON.stringify({ responses: client.responses });
  return {
    rows,
    fingerprint: statsFingerprint(rows),
    quotaUnits: client.quotaUnits,
    evidence: {
      rawBody,
      checksum: createHash("sha256").update(rawBody).digest("hex"),
      sourceUrl: `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,status,snippet&videos=${videoIds.length}`,
    },
  };
}
