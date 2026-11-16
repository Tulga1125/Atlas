import { createHash } from "node:crypto";
import { appleMusicChartResponseSchema } from "./schema";
import { normalizeAppleMusicChart } from "./normalize";
import { validateCompleteChart } from "./validate";

export const APPLE_MUSIC_MONGOLIA_CHART_URL =
  "https://api.music.apple.com/v1/catalog/mn/charts?types=songs&chart=most-played&limit=100&include=artists";

export async function fetchRawAppleMusicChart(developerToken: string) {
  const response = await fetch(APPLE_MUSIC_MONGOLIA_CHART_URL, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${developerToken}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });

  const rawBody = await response.text();
  return {
    rawBody,
    status: response.status,
    retryAfter: response.headers.get("retry-after"),
    checksum: createHash("sha256").update(rawBody).digest("hex"),
    sourceUrl: APPLE_MUSIC_MONGOLIA_CHART_URL,
  };
}

export function parseAppleMusicChart(rawBody: string) {
  const payload: unknown = JSON.parse(rawBody);
  const parsed = appleMusicChartResponseSchema.parse(payload);
  const entries = validateCompleteChart(normalizeAppleMusicChart(parsed));

  return {
    payload,
    entries,
    sourceUrl: APPLE_MUSIC_MONGOLIA_CHART_URL,
    sourceTimestamp: null,
  };
}

export async function fetchAppleMusicMongoliaChart(developerToken: string) {
  const response = await fetchRawAppleMusicChart(developerToken);
  if (response.status !== 200)
    throw new Error(`Apple Music returned ${response.status}`);
  return {
    ...parseAppleMusicChart(response.rawBody),
    checksum: response.checksum,
  };
}
