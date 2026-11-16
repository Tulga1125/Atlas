// A5 one-off probe: does chart=mostPopular&regionCode=MN return anything useful?
// Usage: YOUTUBE_API_KEY=... node scripts/probe-mostpopular.mjs
// Costs 2 quota units. Prints a summary only; the key is never printed.
import { summarise } from "./lib/mostpopular.mjs";

const key = process.env.YOUTUBE_API_KEY;
if (!key) {
  console.error("YOUTUBE_API_KEY is not set; the live probe is pending.");
  process.exit(2);
}
const results = [];
for (const [label, category] of [["music (category 10)", "10"], ["all categories", null]]) {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("chart", "mostPopular");
  url.searchParams.set("regionCode", "MN");
  url.searchParams.set("maxResults", "50");
  if (category) url.searchParams.set("videoCategoryId", category);
  const publicUrl = url.toString();
  url.searchParams.set("key", key);
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const body = await response.json().catch(() => null);
  results.push({ request: publicUrl, status: response.status, error: body?.error?.errors?.[0]?.reason ?? null, ...summarise(label, body) });
}
console.log(JSON.stringify({ probedAt: new Date().toISOString(), results }, null, 2));
