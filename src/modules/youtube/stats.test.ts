import { describe, expect, test } from "vitest";
import { YouTubeSourceError, createYouTubeClient } from "./discovery";
import { StatsValidationError, collectStats, normalizeStats, statsFingerprint, viewDecreases } from "./stats";

const item = (id: string, views: string, extra: object = {}) => ({
  id,
  snippet: { title: `Title ${id}`, channelTitle: "Saran", publishedAt: "2026-10-01T00:00:00Z" },
  statistics: { viewCount: views, likeCount: "10", commentCount: "2" },
  status: { privacyStatus: "public" },
  contentDetails: { duration: "PT3M" },
  ...extra,
});

describe("fixtures", () => {
  test("normal batch", () => {
    expect(normalizeStats([item("bbbbbbbbbbb", "200"), item("aaaaaaaaaaa", "100")], ["aaaaaaaaaaa", "bbbbbbbbbbb"])).toEqual([
      { videoId: "aaaaaaaaaaa", availability: "available", viewCount: "100", likeCount: "10", commentCount: "2", title: "Title aaaaaaaaaaa", channelTitle: "Saran", publishedAt: "2026-10-01T00:00:00Z", durationSeconds: 180 },
      { videoId: "bbbbbbbbbbb", availability: "available", viewCount: "200", likeCount: "10", commentCount: "2", title: "Title bbbbbbbbbbb", channelTitle: "Saran", publishedAt: "2026-10-01T00:00:00Z", durationSeconds: 180 },
    ]);
  });

  test("deleted video: not answered, recorded as missing", () => {
    expect(normalizeStats([], ["deletedvid1"])).toEqual([{ videoId: "deletedvid1", availability: "missing" }]);
  });

  test("private video", () => {
    expect(normalizeStats([item("privatevid1", "5", { status: { privacyStatus: "private" } })], ["privatevid1"])).toEqual([
      { videoId: "privatevid1", availability: "private" },
    ]);
  });

  test("hidden like count stays empty, not zero", () => {
    const [row] = normalizeStats([item("aaaaaaaaaaa", "100", { statistics: { viewCount: "100" } })], ["aaaaaaaaaaa"]);
    expect(row).toMatchObject({ likeCount: null, commentCount: null });
  });

  test("negative or non-numeric counts are rejected", () => {
    expect(() => normalizeStats([item("aaaaaaaaaaa", "-1")], ["aaaaaaaaaaa"])).toThrow(StatsValidationError);
    expect(() => normalizeStats([item("aaaaaaaaaaa", "1.5")], ["aaaaaaaaaaa"])).toThrow(StatsValidationError);
  });

  test("view count decrease is flagged against the last approved value", () => {
    const rows = normalizeStats([item("aaaaaaaaaaa", "90"), item("bbbbbbbbbbb", "300")], ["aaaaaaaaaaa", "bbbbbbbbbbb"]);
    expect(viewDecreases(rows, new Map([["aaaaaaaaaaa", 100], ["bbbbbbbbbbb", 200]]))).toEqual([
      { videoId: "aaaaaaaaaaa", previous: 100, observed: 90 },
    ]);
  });

  test("stale payload: identical counts give an identical fingerprint", () => {
    const a = normalizeStats([item("aaaaaaaaaaa", "100")], ["aaaaaaaaaaa"]);
    const b = normalizeStats([item("aaaaaaaaaaa", "100", { snippet: { title: "Renamed" } })], ["aaaaaaaaaaa"]);
    const c = normalizeStats([item("aaaaaaaaaaa", "101")], ["aaaaaaaaaaa"]);
    expect(statsFingerprint(a)).toBe(statsFingerprint(b));
    expect(statsFingerprint(a)).not.toBe(statsFingerprint(c));
  });
});

function client(status: number, body: string, headers: Record<string, string> = {}) {
  return createYouTubeClient("k".repeat(30), (async () => new Response(body, { status, headers })) as typeof fetch);
}

describe("source errors", () => {
  test("HTTP 403 quota: retry later, not in a tight loop", async () => {
    const error = await collectStats(client(403, JSON.stringify({ error: { errors: [{ reason: "quotaExceeded" }] } })), ["aaaaaaaaaaa"]).catch((e) => e);
    expect(error).toBeInstanceOf(YouTubeSourceError);
    expect(error.retryable).toBe(true);
    expect(error.status).toBe(403);
  });
  test("429 carries Retry-After", async () => {
    const error = await collectStats(client(429, "{}", { "retry-after": "300" }), ["aaaaaaaaaaa"]).catch((e) => e);
    expect([error.retryable, error.retryAfter]).toEqual([true, "300"]);
  });
  test("malformed JSON is not parsed", async () => {
    const error = await collectStats(client(200, "<html>"), ["aaaaaaaaaaa"]).catch((e) => e);
    expect(error.reason).toBe("malformed_json");
  });
  test("batches of 50 cost one unit each and the key never reaches the evidence", async () => {
    const calls: URL[] = [];
    const c = createYouTubeClient("SECRET-KEY-123456789012", (async (u: URL) => {
      calls.push(new URL(String(u)));
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }) as typeof fetch);
    const ids = Array.from({ length: 120 }, (_, i) => `vid${String(i).padStart(8, "0")}`);
    const result = await collectStats(c, ids);
    expect(calls).toHaveLength(3);
    expect(result.quotaUnits).toBe(3);
    expect(result.rows.every((r) => r.availability === "missing")).toBe(true);
    expect(result.evidence.rawBody).not.toContain("SECRET");
  });
});
