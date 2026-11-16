import { afterAll, expect, test, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
vi.mock("server-only", () => ({}));
import { runNextJob } from "@/modules/operations/worker";

// A3 against the isolated local stack: a 429 is retained and retried later,
// then a complete response is stored with one row per watchlist video.
const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
if (url.port !== "55321" || !["localhost", "127.0.0.1"].includes(url.hostname))
  throw new Error("Integration tests require the isolated local database");
const db = createClient<Database>(url.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const realFetch = globalThis.fetch;
afterAll(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

test("daily statistics: rate limit retained, then one row per tracked video", async () => {
  process.env.YOUTUBE_API_KEY = "fixture-only-not-a-youtube-key";
  const videoId = `int${Date.now().toString(36)}`.slice(0, 11).padEnd(11, "x");
  const asset = await db
    .from("platform_assets")
    .insert({ platform_id: "00000000-0000-0000-0000-000000000002", platform_item_id: videoId, platform_artist_name: "UCintegrationchannel0001", platform_title: "Integration video" })
    .select("id")
    .single();
  expect(asset.error).toBeNull();
  expect(
    (await db.from("youtube_video_assets").insert({ platform_asset_id: asset.data!.id, video_id: videoId, channel_id: "UCintegrationchannel0001", discovery_source: "manual" })).error,
  ).toBeNull();
  expect((await db.from("youtube_watchlist").insert({ platform_asset_id: asset.data!.id, reason: "Integration test", discovery_source: "manual" })).error).toBeNull();

  const queued = await db.rpc("enqueue_youtube_stats");
  expect(queued.error).toBeNull();
  const jobId = queued.data!;

  // Only YouTube is stubbed; the database API still goes over the network.
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = new URL(String(input instanceof Request ? input.url : input));
    if (target.hostname !== "www.googleapis.com") return realFetch(input, init);
    return new Response("{}", { status: 429, headers: { "retry-after": "1" } });
  }) as typeof fetch;
  let result = await runNextJob();
  while ("jobId" in result && result.jobId !== jobId) result = await runNextJob();
  expect(result).toMatchObject({ jobId, status: "queued", error: "source_http_429" });
  const retained = await db.from("collection_attempts").select("http_status").eq("job_id", jobId);
  expect(retained.data?.map((a) => a.http_status)).toContain(429);

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = new URL(String(input instanceof Request ? input.url : input));
    if (target.hostname !== "www.googleapis.com") return realFetch(input, init);
    const ids = target.searchParams.get("id")!.split(",");
    return new Response(
      JSON.stringify({
        items: ids.map((id) => ({ id, snippet: { title: `Title ${id}` }, statistics: { viewCount: "1234", likeCount: "5", commentCount: "1" }, status: { privacyStatus: "public" } })),
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  await db.from("pipeline_jobs").update({ available_at: new Date().toISOString() }).eq("id", jobId);
  result = await runNextJob();
  while ("jobId" in result && result.jobId !== jobId) result = await runNextJob();
  expect(result).toMatchObject({ jobId, status: "succeeded" });
  const rows = await db.from("youtube_video_statistics").select("view_count,availability,status").eq("platform_asset_id", asset.data!.id);
  expect(rows.data).toEqual([{ view_count: 1234, availability: "available", status: "approved" }]);
});
