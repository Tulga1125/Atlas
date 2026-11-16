import { createHash } from "node:crypto";
import { z } from "zod";
import {
  isLikelyShort,
  parseDuration,
  publicSourceUrl,
  suggestKind,
  videoIdSchema,
  type AssetKind,
} from "./video";

// Daily candidate discovery (A2). Cheapest sources first:
//   1. verified artist channels' uploads playlists (1 unit per page);
//   2. capped search.list for chart songs without a linked video (100 units);
//   3. videos.list for details of every discovered ID (1 unit per 50).
// Discovery never links anything itself: the database decides, and editors
// confirm. This module only talks to YouTube; the worker stores evidence.

const API = "https://www.googleapis.com/youtube/v3";
export const QUOTA = { playlistItems: 1, videos: 1, search: 100 } as const;

const playlistItemsSchema = z.object({
  items: z.array(
    z.object({
      contentDetails: z.object({ videoId: z.string() }).passthrough(),
    }).passthrough(),
  ),
}).passthrough();

const searchSchema = z.object({
  items: z.array(
    z.object({ id: z.object({ videoId: z.string().optional() }).passthrough() }).passthrough(),
  ),
}).passthrough();

const thumbnail = z.object({ url: z.string() }).passthrough();
const videoSchema = z.object({
  id: z.string(),
  snippet: z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    channelId: z.string(),
    channelTitle: z.string().optional(),
    publishedAt: z.string().optional(),
    thumbnails: z.object({
      high: thumbnail.optional(),
      medium: thumbnail.optional(),
      default: thumbnail.optional(),
    }).passthrough().optional(),
  }).passthrough(),
  contentDetails: z.object({ duration: z.string().optional() }).passthrough().optional(),
}).passthrough();
const videosSchema = z.object({ items: z.array(videoSchema) }).passthrough();

export type CandidateVideo = {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  publishedAt: string | null;
  durationSeconds: number | null;
  isShort: boolean;
  suggestedKind: AssetKind;
  thumbnailUrl: string | null;
};

export type SourceResponse = {
  sourceUrl: string;
  status: number;
  body: string;
};

export class YouTubeSourceError extends Error {
  constructor(
    public status: number,
    public reason: string | null,
    public retryAfter: string | null,
    public response: SourceResponse | null,
  ) {
    super(`YouTube returned ${status}${reason ? ` (${reason})` : ""}`);
  }
  /** Quota, rate limit and server errors are worth retrying later. */
  get retryable() {
    return (
      this.status === 0 ||
      this.status === 429 ||
      this.status >= 500 ||
      (this.status === 403 && /quota|rateLimit/i.test(this.reason ?? ""))
    );
  }
}

export function uploadsPlaylistId(channelId: string) {
  return `UU${channelId.slice(2)}`;
}

export function createYouTubeClient(apiKey: string, fetcher: typeof fetch = fetch) {
  const responses: SourceResponse[] = [];
  let quotaUnits = 0;

  async function get(path: string, params: Record<string, string>, units: number) {
    const url = new URL(`${API}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const sourceUrl = publicSourceUrl(url);
    url.searchParams.set("key", apiKey);
    quotaUnits += units;
    let response: Response;
    try {
      response = await fetcher(url, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new YouTubeSourceError(0, "transport_failed", null, null);
    }
    const body = await response.text();
    const record = { sourceUrl, status: response.status, body };
    responses.push(record);
    if (!response.ok) {
      let reason: string | null = null;
      try {
        reason = JSON.parse(body)?.error?.errors?.[0]?.reason ?? null;
      } catch {}
      throw new YouTubeSourceError(response.status, reason, response.headers.get("retry-after"), record);
    }
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new YouTubeSourceError(response.status, "malformed_json", null, record);
    }
  }

  return {
    responses,
    get quotaUnits() {
      return quotaUnits;
    },
    async uploads(channelId: string, max = 50) {
      const data = playlistItemsSchema.parse(
        await get("playlistItems", {
          part: "contentDetails",
          playlistId: uploadsPlaylistId(channelId),
          maxResults: String(Math.min(max, 50)),
        }, QUOTA.playlistItems),
      );
      return data.items.map((item) => item.contentDetails.videoId);
    },
    async search(query: string, channelId: string | null) {
      const params: Record<string, string> = {
        part: "id",
        type: "video",
        q: query,
        maxResults: "5",
      };
      if (channelId) params.channelId = channelId;
      const data = searchSchema.parse(await get("search", params, QUOTA.search));
      return data.items.flatMap((item) => (item.id.videoId ? [item.id.videoId] : []));
    },
    async videos(ids: string[]) {
      const items: z.infer<typeof videoSchema>[] = [];
      for (let i = 0; i < ids.length; i += 50) {
        const data = videosSchema.parse(
          await get("videos", { part: "snippet,contentDetails", id: ids.slice(i, i + 50).join(",") }, QUOTA.videos),
        );
        items.push(...data.items);
      }
      return items;
    },
  };
}

export type YouTubeClient = ReturnType<typeof createYouTubeClient>;

export function toCandidate(
  video: z.infer<typeof videoSchema>,
  verifiedChannels: Set<string>,
): CandidateVideo | null {
  if (!videoIdSchema.safeParse(video.id).success) return null;
  const { snippet } = video;
  const durationSeconds = parseDuration(video.contentDetails?.duration);
  const thumbnails = snippet.thumbnails;
  const thumbnailUrl =
    thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url ?? null;
  return {
    videoId: video.id,
    channelId: snippet.channelId,
    channelTitle: snippet.channelTitle ?? snippet.channelId,
    title: snippet.title.slice(0, 500),
    publishedAt: snippet.publishedAt ?? null,
    durationSeconds,
    isShort: isLikelyShort(snippet.title, snippet.description ?? null, durationSeconds),
    suggestedKind: suggestKind({
      title: snippet.title,
      channelTitle: snippet.channelTitle ?? null,
      fromVerifiedChannel: verifiedChannels.has(snippet.channelId),
    }),
    thumbnailUrl:
      thumbnailUrl && /^https:\/\/i[0-9]?\.ytimg\.com\//.test(thumbnailUrl) ? thumbnailUrl : null,
  };
}

export type SearchTask = { id: string; query: string; channel_id: string | null };
export type SearchResult = { taskId: string; status: "searched" | "failed"; results: number; units: number };

export type DiscoveryResult = {
  candidates: { source: "channel_uploads" | "chart_search"; videos: CandidateVideo[] }[];
  searches: SearchResult[];
  channels: number;
  quotaUnits: number;
  evidence: { rawBody: string; checksum: string; sourceUrl: string };
};

/**
 * Reads YouTube for one discovery run. Uploads and searches feed one
 * videos.list pass; every response is kept, in order, as source evidence.
 */
export async function discoverVideos(
  client: YouTubeClient,
  channelIds: string[],
  tasks: SearchTask[],
  uploadsPerChannel = 50,
): Promise<DiscoveryResult> {
  const verified = new Set(channelIds);
  const fromUploads = new Set<string>();
  const fromSearch = new Set<string>();
  for (const channelId of [...verified].sort())
    for (const id of await client.uploads(channelId, uploadsPerChannel)) fromUploads.add(id);

  const searches: SearchResult[] = [];
  for (const task of tasks) {
    const ids = await client.search(task.query, task.channel_id);
    for (const id of ids) if (!fromUploads.has(id)) fromSearch.add(id);
    searches.push({ taskId: task.id, status: "searched", results: ids.length, units: QUOTA.search });
  }

  const all = [...fromUploads, ...fromSearch].filter((id) => videoIdSchema.safeParse(id).success);
  const details = all.length ? await client.videos(all) : [];
  const byId = new Map(
    details.flatMap((video) => {
      const candidate = toCandidate(video, verified);
      return candidate ? [[candidate.videoId, candidate] as const] : [];
    }),
  );
  const pick = (ids: Set<string>) =>
    [...ids].flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));

  const rawBody = JSON.stringify({ responses: client.responses });
  return {
    candidates: [
      { source: "channel_uploads", videos: pick(fromUploads) },
      { source: "chart_search", videos: pick(fromSearch) },
    ],
    searches,
    channels: verified.size,
    quotaUnits: client.quotaUnits,
    evidence: {
      rawBody,
      checksum: createHash("sha256").update(rawBody).digest("hex"),
      sourceUrl: `${API}/discovery?channels=${verified.size}&searches=${tasks.length}`,
    },
  };
}

/** Fetches one video for manual entry; returns the candidate and its evidence. */
export async function fetchManualVideo(
  client: YouTubeClient,
  videoId: string,
  verifiedChannels: Set<string>,
) {
  const [video] = await client.videos([videoId]);
  const response = client.responses.at(-1)!;
  return {
    candidate: video ? toCandidate(video, verifiedChannels) : null,
    evidence: {
      sourceUrl: response.sourceUrl,
      status: response.status,
      rawBody: response.body,
      checksum: createHash("sha256").update(response.body).digest("hex"),
    },
  };
}
