import { afterAll, expect, test, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import type { Database } from "@/lib/supabase/database.types";
vi.mock("server-only", () => ({}));
import {
  runNextJob,
  retrySeconds,
  loadFacts,
} from "@/modules/operations/worker";
import * as apple from "@/modules/apple-music/client";
import { getAtlasBusinessDate } from "@/modules/collection/business-date";
import { calculateChart } from "@/modules/analytics/calculate";
const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
if (url.port !== "55321" || !["localhost", "127.0.0.1"].includes(url.hostname))
  throw new Error("Integration tests require the isolated local database");
const db = createClient<Database>(
  url.href,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const today = getAtlasBusinessDate();
afterAll(() => vi.restoreAllMocks());
test("retry delays honor provider limits without dropping the minimum backoff", () => {
  expect(retrySeconds(1, "120")).toBe(120);
  expect(retrySeconds(5)).toBe(1800);
  expect(retrySeconds(2, "bad")).toBe(300);
});
test("historical fixtures calculate complete, deterministic metric runs and briefs", async () => {
  for (let i = 0; i < 10; i++) {
    const result = await runNextJob();
    if ("idle" in result) break;
    expect(result).toMatchObject({ status: "succeeded" });
  }
  const snapshots = await db
    .from("chart_snapshots")
    .select("id,snapshot_date")
    .eq("status", "approved")
    .order("snapshot_date");
  expect(snapshots.error).toBeNull();
  expect(snapshots.data!.length).toBeGreaterThanOrEqual(3);
  for (const snapshot of snapshots.data!) {
    const metrics = await db
      .from("current_chart_metrics")
      .select("*")
      .eq("snapshot_id", snapshot.id);
    expect(metrics.error).toBeNull();
    expect(metrics.data).toHaveLength(100);
    const facts = await loadFacts(db, snapshot.snapshot_date);
    expect(calculateChart([...facts].reverse(), snapshot.id)).toEqual(
      calculateChart(facts, snapshot.id),
    );
  }
});
test("collection retains malformed and rate-limited responses before accepting a complete payload", async () => {
  process.env.APPLE_MUSIC_DEVELOPER_TOKEN = "fixture-only-not-an-apple-token";
  const old = await db
    .from("chart_snapshots")
    .select("id")
    .eq("snapshot_date", today)
    .eq("status", "approved")
    .maybeSingle();
  expect(old.error).toBeNull();
  const queued = await db.rpc("enqueue_collection", {
    p_date: today,
    p_revision_of: old.data?.id,
    p_reason: "Local source contract verification",
  });
  expect(queued.error).toBeNull();
  const jobId = queued.data!;
  const mock = vi.spyOn(apple, "fetchRawAppleMusicChart");
  const source = (body: string, status = 200) => ({
    rawBody: body,
    status,
    checksum: createHash("sha256").update(body).digest("hex"),
    retryAfter: status === 429 ? "120" : null,
    sourceUrl: apple.APPLE_MUSIC_MONGOLIA_CHART_URL,
  });
  mock.mockResolvedValueOnce(source("<html>upstream error</html>"));
  expect(await runNextJob()).toMatchObject({
    jobId,
    status: "review",
    error: "invalid_payload",
  });
  let attempts = await db
    .from("collection_attempts")
    .select("raw_body,http_status")
    .eq("job_id", jobId);
  expect(attempts.data).toEqual([
    { raw_body: "<html>upstream error</html>", http_status: 200 },
  ]);
  // Service-only fixture intervention; UI retries are separately covered by role-gated SQL tests.
  await db
    .from("pipeline_jobs")
    .update({ status: "queued", available_at: new Date().toISOString() })
    .eq("id", jobId);
  mock.mockResolvedValueOnce(source('{"error":"rate limited"}', 429));
  expect(await runNextJob()).toMatchObject({ jobId, error: "source_http_429" });
  const retry = await db
    .from("pipeline_jobs")
    .select("status,available_at")
    .eq("id", jobId)
    .single();
  expect(retry.data!.status).toBe("queued");
  expect(Date.parse(retry.data!.available_at) - Date.now()).toBeGreaterThan(
    100000,
  );
  await db
    .from("pipeline_jobs")
    .update({ available_at: new Date().toISOString() })
    .eq("id", jobId);
  const payload = {
    results: {
      songs: [
        {
          chart: "most-played",
          name: "Top Songs",
          data: Array.from({ length: 100 }, (_, i) => ({
            id: `fixture-song-${i + 1}`,
            type: "songs",
            attributes: {
              name: `Fixture Song ${i + 1}`,
              artistName: "Fixture Artist",
              url: `https://music.apple.com/mn/song/${i + 1}`,
            },
            relationships: {
              artists: {
                data: [
                  { id: "123456789", attributes: { name: "Fixture Artist" } },
                ],
              },
            },
          })),
        },
      ],
    },
  };
  mock.mockResolvedValueOnce(source(JSON.stringify(payload)));
  expect(await runNextJob()).toMatchObject({ jobId, status: "succeeded" });
  attempts = await db
    .from("collection_attempts")
    .select("raw_body,http_status")
    .eq("job_id", jobId);
  expect(attempts.data).toHaveLength(3);
  for (let i = 0; i < 10; i++) {
    const result = await runNextJob();
    if ("idle" in result) break;
    expect(result).toMatchObject({ status: "succeeded" });
  }
  const snapshot = await db
    .from("chart_snapshots")
    .select("id")
    .eq("snapshot_date", today)
    .eq("status", "approved")
    .single();
  expect(snapshot.error).toBeNull();
  const metrics = await db
    .from("current_chart_metrics")
    .select("entry_id")
    .eq("snapshot_id", snapshot.data!.id);
  expect(metrics.data).toHaveLength(100);
  const brief = await db
    .from("daily_briefs")
    .select("body_mn")
    .eq("snapshot_id", snapshot.data!.id);
  expect(brief.data!.length).toBeGreaterThan(0);
});
