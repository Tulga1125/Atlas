import { createHash } from "node:crypto";
import { z } from "zod";

const countSchema = z.string().regex(/^\d+$/);

const thumbnailSchema = z
  .object({
    url: z.string().min(1),
  })
  .passthrough();

const youtubeChannelSchema = z
  .object({
    id: z.string().min(1),
    snippet: z
      .object({
        title: z.string().min(1),
        description: z.string().optional(),
        customUrl: z.string().optional(),
        publishedAt: z.string().optional(),
        thumbnails: z
          .object({
            high: thumbnailSchema.optional(),
            medium: thumbnailSchema.optional(),
            default: thumbnailSchema.optional(),
          })
          .optional(),
      })
      .passthrough(),
    statistics: z
      .object({
        viewCount: countSchema,
        subscriberCount: countSchema.optional(),
        hiddenSubscriberCount: z.boolean().optional(),
        videoCount: countSchema,
      })
      .passthrough(),
  })
  .passthrough();

export const youtubeChannelsResponseSchema = z
  .object({
    items: z.array(youtubeChannelSchema),
  })
  .passthrough();

export type YouTubeMetric = {
  name: "subscribers" | "total_views" | "video_count";
  value: string;
  unit: "people" | "views" | "videos";
};

export type YouTubeChannel = {
  channelId: string;
  title: string;
  description: string | null;
  customUrl: string | null;
  profileUrl: string;
  imageUrl: string | null;
  publishedAt: string | null;
  metrics: YouTubeMetric[];
};

export type YouTubeChannelBatch = {
  sourceUrl: string;
  checksum: string;
  payload: unknown;
  channels: YouTubeChannel[];
};

const YOUTUBE_CHANNELS_URL =
  "https://www.googleapis.com/youtube/v3/channels";

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from(
    { length: Math.ceil(items.length / size) },
    (_, index) => items.slice(index * size, (index + 1) * size),
  );
}

export function normalizeYouTubeChannel(
  channel: z.infer<typeof youtubeChannelSchema>,
): YouTubeChannel {
  const thumbnails = channel.snippet.thumbnails;
  const metrics: YouTubeMetric[] = [
    {
      name: "total_views",
      value: channel.statistics.viewCount,
      unit: "views",
    },
    {
      name: "video_count",
      value: channel.statistics.videoCount,
      unit: "videos",
    },
  ];

  if (
    !channel.statistics.hiddenSubscriberCount &&
    channel.statistics.subscriberCount
  ) {
    metrics.unshift({
      name: "subscribers",
      value: channel.statistics.subscriberCount,
      unit: "people",
    });
  }

  return {
    channelId: channel.id,
    title: channel.snippet.title,
    description: channel.snippet.description ?? null,
    customUrl: channel.snippet.customUrl ?? null,
    profileUrl: `https://www.youtube.com/channel/${channel.id}`,
    imageUrl:
      thumbnails?.high?.url ??
      thumbnails?.medium?.url ??
      thumbnails?.default?.url ??
      null,
    publishedAt: channel.snippet.publishedAt ?? null,
    metrics,
  };
}

export async function fetchYouTubeChannels(
  apiKey: string,
  channelIds: string[],
): Promise<YouTubeChannelBatch[]> {
  const uniqueChannelIds = [...new Set(channelIds)];
  const batches: YouTubeChannelBatch[] = [];

  for (const ids of chunk(uniqueChannelIds, 50)) {
    const publicUrl = new URL(YOUTUBE_CHANNELS_URL);
    publicUrl.searchParams.set("part", "snippet,statistics");
    publicUrl.searchParams.set("id", ids.join(","));

    const requestUrl = new URL(publicUrl);
    requestUrl.searchParams.set("key", apiKey);

    const response = await fetch(requestUrl, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `YouTube channels returned ${response.status}: ${detail.slice(0, 300)}`,
      );
    }

    const payload: unknown = await response.json();
    const parsed = youtubeChannelsResponseSchema.parse(payload);
    const serializedPayload = JSON.stringify(payload);

    batches.push({
      sourceUrl: publicUrl.toString(),
      checksum: createHash("sha256").update(serializedPayload).digest("hex"),
      payload,
      channels: parsed.items.map(normalizeYouTubeChannel),
    });
  }

  return batches;
}
