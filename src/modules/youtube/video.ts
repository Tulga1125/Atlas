import { z } from "zod";

// YouTube video identity, duration and kind helpers. Pure functions only.

export const videoIdSchema = z.string().regex(/^[A-Za-z0-9_-]{11}$/);
export const channelIdSchema = z.string().regex(/^UC[A-Za-z0-9_-]{22}$/);

export const assetKinds = [
  "official_music_video",
  "official_audio",
  "lyric_video",
  "live",
  "other",
] as const;
export type AssetKind = (typeof assetKinds)[number];

/** Kinds that count towards a song's YouTube total (owner decision D4). */
export const countingKinds: readonly AssetKind[] = [
  "official_music_video",
  "official_audio",
  "lyric_video",
];

/** Accepts a bare ID or any common YouTube URL form; returns the video ID. */
export function parseVideoId(input: string): string | null {
  const value = input.trim();
  if (videoIdSchema.safeParse(value).success) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const match = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
      id = match?.[1] ?? null;
    }
  }
  return id && videoIdSchema.safeParse(id).success ? id : null;
}

export function videoUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** ISO 8601 duration as returned by contentDetails.duration (PT3M21S). */
export function parseDuration(value: string | undefined | null): number | null {
  if (!value) return null;
  const match = value.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
  );
  if (!match || value === "P" || value === "PT") return null;
  const [, d, h, m, s] = match.map((part) => Number(part ?? 0));
  return d * 86_400 + h * 3_600 + m * 60 + s;
}

/**
 * Heuristic: the API does not say whether a video is a Short. Treat it as one
 * when tagged #shorts or no longer than 60 seconds. Shown as an estimate.
 */
export function isLikelyShort(
  title: string,
  description: string | null,
  durationSeconds: number | null,
) {
  if (/#shorts?\b/i.test(`${title} ${description ?? ""}`)) return true;
  return durationSeconds !== null && durationSeconds > 0 && durationSeconds <= 60;
}

const LYRIC = /(?<![\p{L}\p{N}])(?:lyric|lyrics|дууны үг)(?![\p{L}\p{N}])/iu;
const LIVE =
  /(?<![\p{L}\p{N}])(?:live|концерт|тоглолт|performance|session|unplugged)(?![\p{L}\p{N}])/iu;
const OFFICIAL =
  /(?<![\p{L}\p{N}])(?:official music video|official video|official mv|music video|m\/v|mv|клип)(?![\p{L}\p{N}])/iu;
const AUDIO = /(?<![\p{L}\p{N}])(?:official audio|audio|visuali[sz]er)(?![\p{L}\p{N}])/iu;

/**
 * A suggested kind for the editor. Only a verified channel's upload can be an
 * official asset; anything else is suggested as "other".
 */
export function suggestKind(input: {
  title: string;
  channelTitle: string | null;
  fromVerifiedChannel: boolean;
}): AssetKind {
  const { title, channelTitle, fromVerifiedChannel } = input;
  if (LIVE.test(title)) return "live";
  if (!fromVerifiedChannel) return "other";
  if (channelTitle && / - Topic$/.test(channelTitle)) return "official_audio";
  if (LYRIC.test(title)) return "lyric_video";
  if (AUDIO.test(title)) return "official_audio";
  if (OFFICIAL.test(title)) return "official_music_video";
  return "other";
}

/** Removes the API key from a request URL before it is stored or logged. */
export function publicSourceUrl(url: URL) {
  const copy = new URL(url);
  copy.searchParams.delete("key");
  return copy.toString();
}
