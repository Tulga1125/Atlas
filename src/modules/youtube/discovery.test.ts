import { describe, expect, test } from "vitest";
import {
  QUOTA,
  YouTubeSourceError,
  createYouTubeClient,
  discoverVideos,
  fetchManualVideo,
  uploadsPlaylistId,
} from "./discovery";

const VERIFIED = "UCverifiedchannel0000001";
const OTHER = "UCunverifiedchannel00002";

function video(id: string, title: string, channelId = VERIFIED, duration = "PT3M21S") {
  return {
    id,
    snippet: {
      title,
      channelId,
      channelTitle: channelId === VERIFIED ? "Saran" : "Fan uploads",
      publishedAt: "2026-11-01T10:00:00Z",
      thumbnails: { high: { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } },
    },
    contentDetails: { duration },
  };
}

type Route = (url: URL) => { status?: number; body: unknown; headers?: Record<string, string> };

function fakeFetch(route: Route) {
  const calls: URL[] = [];
  const fetcher = (async (input: URL | string) => {
    const url = new URL(String(input));
    calls.push(url);
    const { status = 200, body, headers = {} } = route(url);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
  }) as typeof fetch;
  return { fetcher, calls };
}

const happy: Route = (url) => {
  if (url.pathname.endsWith("/playlistItems"))
    return {
      body: {
        items: ["vidAutoLnk1", "vidNoMatch3"].map((videoId) => ({ contentDetails: { videoId } })),
      },
    };
  if (url.pathname.endsWith("/search"))
    return { body: { items: [{ id: { videoId: "vidUnverif2" } }, { id: { videoId: "vidAutoLnk1" } }, { id: {} }] } };
  if (url.pathname.endsWith("/videos")) {
    const ids = url.searchParams.get("id")!.split(",");
    const all = [
      video("vidAutoLnk1", "Saran - Хайртай (Official MV)"),
      video("vidNoMatch3", "Behind the scenes #shorts", VERIFIED, "PT45S"),
      video("vidUnverif2", "Хайртай (Official MV)", OTHER),
    ];
    return { body: { items: all.filter((v) => ids.includes(v.id)) } };
  }
  return { status: 404, body: {} };
};

describe("discoverVideos", () => {
  test("reads uploads, searches and details, with evidence and quota", async () => {
    const { fetcher, calls } = fakeFetch(happy);
    const client = createYouTubeClient("SECRET-KEY-123456789012", fetcher);
    const result = await discoverVideos(client, [VERIFIED], [
      { id: "task-1", query: "Хайртай Saran", channel_id: null },
    ]);

    expect(calls[0].searchParams.get("playlistId")).toBe(uploadsPlaylistId(VERIFIED));
    expect(result.channels).toBe(1);
    expect(result.quotaUnits).toBe(QUOTA.playlistItems + QUOTA.search + QUOTA.videos);
    expect(result.searches).toEqual([{ taskId: "task-1", status: "searched", results: 2, units: 100 }]);

    const uploads = result.candidates.find((c) => c.source === "channel_uploads")!.videos;
    const searched = result.candidates.find((c) => c.source === "chart_search")!.videos;
    expect(uploads.map((v) => v.videoId)).toEqual(["vidAutoLnk1", "vidNoMatch3"]);
    // A video found both ways is recorded once, as an upload.
    expect(searched.map((v) => v.videoId)).toEqual(["vidUnverif2"]);

    expect(uploads[0]).toMatchObject({ durationSeconds: 201, isShort: false, suggestedKind: "official_music_video" });
    expect(uploads[1]).toMatchObject({ isShort: true });
    // Only a verified channel's upload can be suggested as official.
    expect(searched[0].suggestedKind).toBe("other");

    expect(result.evidence.rawBody).not.toContain("SECRET-KEY");
    expect(JSON.parse(result.evidence.rawBody).responses).toHaveLength(3);
    expect(result.evidence.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  test("restricts searches to the verified channel when one is known", async () => {
    const { fetcher, calls } = fakeFetch(happy);
    await discoverVideos(createYouTubeClient("k".repeat(30), fetcher), [], [
      { id: "t", query: "Хайртай", channel_id: VERIFIED },
    ]);
    expect(calls.find((u) => u.pathname.endsWith("/search"))!.searchParams.get("channelId")).toBe(VERIFIED);
  });

  test("no channels and no tasks costs nothing", async () => {
    const { fetcher, calls } = fakeFetch(happy);
    const result = await discoverVideos(createYouTubeClient("k".repeat(30), fetcher), [], []);
    expect(calls).toHaveLength(0);
    expect(result.quotaUnits).toBe(0);
  });

  test("drops non-YouTube thumbnails", async () => {
    const { fetcher } = fakeFetch((url) =>
      url.pathname.endsWith("/playlistItems")
        ? { body: { items: [{ contentDetails: { videoId: "vidAutoLnk1" } }] } }
        : {
            body: {
              items: [{ ...video("vidAutoLnk1", "Хайртай"), snippet: { ...video("vidAutoLnk1", "Хайртай").snippet, thumbnails: { high: { url: "https://evil.example/x.jpg" } } } }],
            },
          },
    );
    const result = await discoverVideos(createYouTubeClient("k".repeat(30), fetcher), [VERIFIED], []);
    expect(result.candidates[0].videos[0].thumbnailUrl).toBeNull();
  });
});

describe("source errors", () => {
  const failing = (status: number, body: unknown, headers?: Record<string, string>) =>
    fakeFetch(() => ({ status, body, headers })).fetcher;

  test("quota exhaustion is retryable and keeps the response", async () => {
    const client = createYouTubeClient("k".repeat(30), failing(403, { error: { errors: [{ reason: "quotaExceeded" }] } }));
    const error = await discoverVideos(client, [VERIFIED], []).catch((e) => e);
    expect(error).toBeInstanceOf(YouTubeSourceError);
    expect(error.retryable).toBe(true);
    expect(error.reason).toBe("quotaExceeded");
    expect(error.response.status).toBe(403);
  });

  test("429 honours Retry-After", async () => {
    const client = createYouTubeClient("k".repeat(30), failing(429, {}, { "retry-after": "120" }));
    const error = await discoverVideos(client, [VERIFIED], []).catch((e) => e);
    expect(error.retryable).toBe(true);
    expect(error.retryAfter).toBe("120");
  });

  test("a forbidden key is not retried", async () => {
    const client = createYouTubeClient("k".repeat(30), failing(403, { error: { errors: [{ reason: "forbidden" }] } }));
    expect((await discoverVideos(client, [VERIFIED], []).catch((e) => e)).retryable).toBe(false);
  });

  test("malformed JSON is reported, not parsed", async () => {
    const client = createYouTubeClient("k".repeat(30), failing(200, "<html>oops</html>"));
    const error = await discoverVideos(client, [VERIFIED], []).catch((e) => e);
    expect(error.reason).toBe("malformed_json");
    expect(error.retryable).toBe(false);
  });

  test("transport failure is retryable", async () => {
    const client = createYouTubeClient("k".repeat(30), (async () => {
      throw new Error("network");
    }) as typeof fetch);
    expect((await discoverVideos(client, [VERIFIED], []).catch((e) => e)).retryable).toBe(true);
  });
});

test("manual entry fetches one video with its own evidence", async () => {
  const { fetcher } = fakeFetch(happy);
  const result = await fetchManualVideo(createYouTubeClient("SECRET-KEY-123456789012", fetcher), "vidUnverif2", new Set([VERIFIED]));
  expect(result.candidate).toMatchObject({ videoId: "vidUnverif2", channelId: OTHER, suggestedKind: "other" });
  expect(result.evidence.sourceUrl).not.toContain("SECRET");
  expect(result.evidence.status).toBe(200);
});

test("the trending feed adds candidates and keeps YouTube's order", async () => {
  const { fetcher, calls } = fakeFetch((url) =>
    url.searchParams.get("chart") === "mostPopular"
      ? { body: { items: [{ id: "vidUnverif2" }, { id: "vidAutoLnk1" }] } }
      : happy(url),
  );
  const result = await discoverVideos(createYouTubeClient("k".repeat(30), fetcher), [VERIFIED], [], 50, { regionCode: "MN", videoCategoryId: "10", maxResults: 50 });
  const chart = calls.find((u) => u.searchParams.get("chart") === "mostPopular")!;
  expect([chart.searchParams.get("regionCode"), chart.searchParams.get("videoCategoryId")]).toEqual(["MN", "10"]);
  expect(result.trending).toEqual(["vidUnverif2", "vidAutoLnk1"]);
  // A trending video already found in uploads is recorded once, as an upload.
  expect(result.candidates.find((c) => c.source === "most_popular_mn")!.videos.map((v) => v.videoId)).toEqual(["vidUnverif2"]);
});

test("with the feed off, no trending call is made", async () => {
  const { fetcher, calls } = fakeFetch(happy);
  const result = await discoverVideos(createYouTubeClient("k".repeat(30), fetcher), [VERIFIED], []);
  expect(calls.some((u) => u.searchParams.get("chart") === "mostPopular")).toBe(false);
  expect(result.trending).toEqual([]);
});

describe("allUploads", () => {
  test("follows page tokens until the last page and counts one unit per page", async () => {
    const { fetcher, calls } = fakeFetch((url) => {
      const page = url.searchParams.get("pageToken");
      return page === "P2"
        ? { body: { items: [{ contentDetails: { videoId: "vidPageTwo1" } }] } }
        : { body: { nextPageToken: "P2", items: [{ contentDetails: { videoId: "vidPageOne1" } }] } };
    });
    const client = createYouTubeClient("secret", fetcher);
    expect(await client.allUploads(VERIFIED)).toEqual({ ids: ["vidPageOne1", "vidPageTwo1"], complete: true });
    expect(calls).toHaveLength(2);
    expect(client.quotaUnits).toBe(2 * QUOTA.playlistItems);
    expect(client.responses.every((r) => !r.sourceUrl.includes("secret"))).toBe(true);
  });

  test("reports an incomplete list when the page cap is reached", async () => {
    const { fetcher } = fakeFetch(() => ({ body: { nextPageToken: "more", items: [{ contentDetails: { videoId: "vidAlways01" } }] } }));
    expect((await createYouTubeClient("k", fetcher).allUploads(VERIFIED, 3)).complete).toBe(false);
  });
});

test("a spent daily search limit fails the searches, not the whole discovery", async () => {
  const { fetcher } = fakeFetch((url) => {
    if (url.pathname.endsWith("/search")) return { status: 429, body: { error: { errors: [{ reason: "rateLimitExceeded" }] } } };
    return happy(url);
  });
  const result = await discoverVideos(createYouTubeClient("k", fetcher), [VERIFIED], [
    { id: "t1", query: "a", channel_id: null },
    { id: "t2", query: "b", channel_id: null },
  ]);
  expect(result.searches.map((s) => s.status)).toEqual(["failed", "failed"]);
  expect(result.candidates.find((c) => c.source === "channel_uploads")!.videos.length).toBeGreaterThan(0);
});
