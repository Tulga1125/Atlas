import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import {
  APPLE_MUSIC_MONGOLIA_CHART_URL,
  fetchRawAppleMusicChart,
  parseAppleMusicChart,
} from "@/modules/apple-music/client";
import {
  calculateChart,
  configurationSchema,
  factSchema,
  formulaVersion,
  type Fact,
} from "@/modules/analytics/calculate";
import { getAtlasBusinessDate } from "@/modules/collection/business-date";
import {
  YouTubeSourceError,
  createYouTubeClient,
  discoverVideos,
} from "@/modules/youtube/discovery";
import { StatsValidationError, collectStats, statsFingerprint, type StatsRow } from "@/modules/youtube/stats";
import { shiftDate } from "@/modules/analytics/calculate";
import { z } from "zod";

const jobSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "collect",
    "calculate",
    "artists",
    "youtube_retention",
    "youtube_discovery",
    "youtube_daily_stats",
  ]),
  business_date: z.string(),
  snapshot_id: z.string().nullable(),
  lease_token: z.string(),
  attempts: z.number(),
});
class PipelineError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable = false,
    public review = false,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
export function retrySeconds(
  attempt: number,
  retryAfter: string | null = null,
  now = Date.now(),
) {
  const provider = retryAfter
    ? /^\d+$/.test(retryAfter)
      ? Number(retryAfter)
      : Math.max(0, Math.ceil((Date.parse(retryAfter) - now) / 1000))
    : 0;
  return Math.max(
    [60, 300, 900, 1800][Math.min(Math.max(attempt - 1, 0), 3)],
    Number.isFinite(provider) ? provider : 0,
  );
}
export async function loadFacts(
  db: ReturnType<typeof createAdminClient>,
  through: string,
): Promise<Fact[]> {
  const rows: Fact[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from("chart_facts")
      .select("*")
      .lte("snapshot_date", through)
      .order("snapshot_date")
      .order("entry_id")
      .range(offset, offset + 999);
    check(error);
    const batch = z.array(factSchema).parse(data);
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  const songIds = [...new Set(rows.map((f) => f.song_id))];
  for (let offset = 0; offset < songIds.length; offset += 100) {
    const batchIds = songIds.slice(offset, offset + 100);
    const { data, error } = await db
      .from("song_artists")
      .select("song_id,artist_id")
      .in("song_id", batchIds);
    check(error);
    for (const row of rows.filter((f) => batchIds.includes(f.song_id)))
      row.artistIds = (data ?? [])
        .filter((c) => c.song_id === row.song_id)
        .map((c) => c.artist_id)
        .sort();
  }
  return rows;
}
export async function runNextJob() {
  const db = createAdminClient();
  const { data: claimed, error } = await db.rpc("claim_pipeline_job");
  check(error);
  if (!claimed?.length) return { idle: true };
  const job = jobSchema.parse(claimed[0]);
  try {
    if (job.kind === "collect") {
      if (job.business_date !== getAtlasBusinessDate())
        throw new PipelineError(
          "missed_date",
          "The source no longer represents this business date; historical backfill is unavailable.",
          false,
          true,
        );
      const token = process.env.APPLE_MUSIC_DEVELOPER_TOKEN;
      if (!token)
        throw new PipelineError(
          "source_not_configured",
          "Apple Music credentials are missing.",
        );
      let source: Awaited<ReturnType<typeof fetchRawAppleMusicChart>>;
      try {
        source = await fetchRawAppleMusicChart(token);
      } catch {
        const retained = await db.from("collection_attempts").insert({
          job_id: job.id,
          attempt_number: job.attempts,
          lease_token: job.lease_token,
          source_url: APPLE_MUSIC_MONGOLIA_CHART_URL,
          error_code: "transport_failed",
        });
        check(retained.error);
        throw new PipelineError(
          "transport_failed",
          "Apple Music request timed out or failed.",
          true,
        );
      }
      const { data: attempt, error: retentionError } = await db
        .from("collection_attempts")
        .insert({
          job_id: job.id,
          attempt_number: job.attempts,
          lease_token: job.lease_token,
          source_url: source.sourceUrl,
          http_status: source.status,
          raw_body: source.rawBody,
          checksum: source.checksum,
        })
        .select("id")
        .single();
      check(retentionError);
      if (source.status !== 200)
        throw new PipelineError(
          `source_http_${source.status}`,
          `Apple Music returned HTTP ${source.status}.`,
          source.status === 429 || source.status >= 500,
          false,
          retrySeconds(job.attempts, source.retryAfter),
        );
      let parsed: ReturnType<typeof parseAppleMusicChart>;
      try {
        parsed = parseAppleMusicChart(source.rawBody);
      } catch {
        throw new PipelineError(
          "invalid_payload",
          "The source response failed schema, rank, identity, or completeness validation.",
          false,
          true,
        );
      }
      const { data: duplicates, error: duplicateError } = await db
        .from("chart_snapshots")
        .select("id")
        .eq("checksum", source.checksum)
        .eq("status", "approved")
        .lt("snapshot_date", job.business_date)
        .limit(1);
      check(duplicateError);
      if (duplicates?.length) {
        const { data: reviews, error: reviewError } = await db
          .from("attempt_reviews")
          .select("id")
          .eq("job_id", job.id)
          .eq("checksum", source.checksum)
          .limit(1);
        check(reviewError);
        if (!reviews?.length)
          throw new PipelineError(
            "payload_stale",
            "Repeated source payload requires a documented freshness review.",
            false,
            true,
          );
      }
      const completed = await db.rpc("complete_collection", {
        p_job: job.id,
        p_token: job.lease_token,
        p_attempt: attempt!.id,
        p_payload: z.json().parse(parsed.payload),
        p_entries: parsed.entries,
      });
      check(completed.error);
      return { jobId: job.id, snapshotId: completed.data, status: "succeeded" };
    }
    if (job.kind === "calculate") {
      const { data: config, error: configError } = await db
        .from("methodology_configuration")
        .select("parameters")
        .eq("code", formulaVersion)
        .single();
      check(configError);
      const facts = await loadFacts(db, job.business_date);
      const result = calculateChart(
        facts,
        job.snapshot_id!,
        configurationSchema.parse(config!.parameters),
      );
      const completed = await db.rpc("complete_analysis", {
        p_job: job.id,
        p_token: job.lease_token,
        p_version: formulaVersion,
        p_inputs: result.inputs,
        p_summary: result.summary,
        p_metrics: result.metrics,
        p_signals: result.signals,
        p_brief: result.brief,
      });
      check(completed.error);
      return { jobId: job.id, runId: completed.data, status: "succeeded" };
    }
    if (job.kind === "youtube_retention") {
      // Deletes only expired YouTube data; Apple and editorial rows are
      // protected by the database guard. See docs/OPERATIONS.md.
      const completed = await db.rpc("run_youtube_retention", {
        p_job: job.id,
        p_token: job.lease_token,
      });
      check(completed.error);
      return { jobId: job.id, retention: completed.data, status: "succeeded" };
    }
    if (job.kind === "youtube_discovery") return await runYouTubeDiscovery(db, job);
    if (job.kind === "youtube_daily_stats") return await runYouTubeStats(db, job);
    throw new PipelineError(
      "unsupported_job",
      "Optional artist enrichment uses its separate manual endpoint.",
    );
  } catch (error) {
    const known =
      error instanceof PipelineError
        ? error
        : new PipelineError(
            "processing_failed",
            "Processing failed; inspect the job and server logs.",
            true,
          );
    if (!(error instanceof PipelineError))
      console.error("Atlas worker failed", {
        jobId: job.id,
        error: error instanceof Error ? error.message : "unknown",
      });
    const failed = await db.rpc("finish_pipeline_failure", {
      p_job: job.id,
      p_token: job.lease_token,
      p_code: known.code,
      p_message: known.message,
      p_retry_seconds: known.retryable
        ? (known.retryAfter ?? retrySeconds(job.attempts))
        : undefined,
      p_review: known.review,
    });
    check(failed.error);
    return {
      jobId: job.id,
      status: known.review
        ? "review"
        : known.retryable && job.attempts < 5
          ? "queued"
          : "failed",
      error: known.code,
    };
  }
}

const YOUTUBE_PLATFORM_ID = "00000000-0000-0000-0000-000000000002";
const discoveryConfigSchema = z.object({
  searchDailyCap: z.number().int().nonnegative(),
  uploadsPerChannel: z.number().int().min(1).max(50),
});

// A2: find candidate videos. Discovery never links; the database applies the
// auto-link rule and editors confirm every link in /dashboard/catalog/youtube.
async function runYouTubeDiscovery(
  db: ReturnType<typeof createAdminClient>,
  job: z.infer<typeof jobSchema>,
) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey)
    throw new PipelineError(
      "source_not_configured",
      "YouTube API key is missing.",
    );
  const [profiles, config, queued] = await Promise.all([
    db
      .from("artist_platform_profiles")
      .select("platform_artist_id")
      .eq("platform_id", YOUTUBE_PLATFORM_ID)
      .eq("match_status", "verified")
      .eq("is_primary", true)
      .limit(1_000),
    db
      .from("methodology_configuration")
      .select("parameters")
      .eq("code", "youtube-catalog-v1")
      .single(),
    db.rpc("queue_youtube_chart_searches", {
      p_job: job.id,
      p_token: job.lease_token,
    }),
  ]);
  check(profiles.error);
  check(config.error);
  check(queued.error);
  const settings = discoveryConfigSchema.parse(config.data!.parameters);
  const client = createYouTubeClient(apiKey);
  let result: Awaited<ReturnType<typeof discoverVideos>>;
  try {
    result = await discoverVideos(
      client,
      (profiles.data ?? []).map((p) => p.platform_artist_id),
      (queued.data ?? []).slice(0, settings.searchDailyCap),
      settings.uploadsPerChannel,
    );
  } catch (error) {
    if (!(error instanceof YouTubeSourceError)) throw error;
    // Keep the failing response as evidence before retrying.
    const retained = await db.from("collection_attempts").insert({
      job_id: job.id,
      attempt_number: job.attempts,
      lease_token: job.lease_token,
      source_url:
        error.response?.sourceUrl ?? "https://www.googleapis.com/youtube/v3",
      http_status: error.status || null,
      raw_body: error.response?.body ?? null,
      error_code: error.reason ?? "transport_failed",
    });
    check(retained.error);
    throw new PipelineError(
      error.status ? `source_http_${error.status}` : "transport_failed",
      `YouTube discovery failed: ${error.message}.`,
      error.retryable,
      false,
      error.retryable
        ? Math.max(
            retrySeconds(job.attempts, error.retryAfter),
            error.status === 403 ? 3_600 : 0,
          )
        : undefined,
    );
  }
  const { data: attempt, error: attemptError } = await db
    .from("collection_attempts")
    .insert({
      job_id: job.id,
      attempt_number: job.attempts,
      lease_token: job.lease_token,
      source_url: result.evidence.sourceUrl,
      http_status: 200,
      raw_body: result.evidence.rawBody,
      checksum: result.evidence.checksum,
    })
    .select("id")
    .single();
  check(attemptError);
  for (const search of result.searches) {
    const finished = await db.rpc("finish_youtube_search_task", {
      p_job: job.id,
      p_token: job.lease_token,
      p_task: search.taskId,
      p_status: search.status,
      p_units: search.units,
      p_results: search.results,
    });
    check(finished.error);
  }
  const counts: Record<string, Json> = {};
  for (const group of result.candidates) {
    for (let i = 0; i < group.videos.length; i += 500) {
      const recorded = await db.rpc("record_youtube_candidates", {
        p_job: job.id,
        p_token: job.lease_token,
        p_attempt: attempt!.id,
        p_source: group.source,
        p_videos: group.videos.slice(i, i + 500),
      });
      check(recorded.error);
      counts[`${group.source}:${i / 500}`] = recorded.data;
    }
  }
  const summary = {
    channels: result.channels,
    searches: result.searches.length,
    quotaUnits: result.quotaUnits,
    attemptId: attempt!.id,
    counts,
  };
  const completed = await db.rpc("complete_youtube_discovery", {
    p_job: job.id,
    p_token: job.lease_token,
    p_summary: summary,
  });
  check(completed.error);
  return { jobId: job.id, discovery: summary, status: "succeeded" };
}

/** Keeps the failing YouTube response as evidence, then fails or retries the job. */
async function youtubeFailure(
  db: ReturnType<typeof createAdminClient>,
  job: z.infer<typeof jobSchema>,
  error: YouTubeSourceError,
  label: string,
): Promise<never> {
  const retained = await db.from("collection_attempts").insert({
    job_id: job.id,
    attempt_number: job.attempts,
    lease_token: job.lease_token,
    source_url: error.response?.sourceUrl ?? "https://www.googleapis.com/youtube/v3",
    http_status: error.status || null,
    raw_body: error.response?.body ?? null,
    error_code: error.reason ?? "transport_failed",
  });
  check(retained.error);
  throw new PipelineError(
    error.status ? `source_http_${error.status}` : "transport_failed",
    `${label} failed: ${error.message}.`,
    error.retryable,
    !error.retryable && error.reason === "malformed_json",
    error.retryable
      ? Math.max(retrySeconds(job.attempts, error.retryAfter), error.status === 403 ? 3_600 : 0)
      : undefined,
  );
}

// A3: one statistics row per active watchlist video for today's business
// date. Never backfills; a stale payload goes to review, not approval.
async function runYouTubeStats(
  db: ReturnType<typeof createAdminClient>,
  job: z.infer<typeof jobSchema>,
) {
  if (job.business_date !== getAtlasBusinessDate())
    throw new PipelineError(
      "missed_date",
      "YouTube statistics are only collected for the current business date; the day stays a gap.",
      false,
      true,
    );
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey)
    throw new PipelineError("source_not_configured", "YouTube API key is missing.");
  const watch = await db
    .from("youtube_watchlist")
    .select("youtube_video_assets(video_id)")
    .eq("active", true)
    .limit(5_000);
  check(watch.error);
  const ids = (watch.data ?? [])
    .map((w) => w.youtube_video_assets?.video_id)
    .filter((v): v is string => !!v);
  let result: Awaited<ReturnType<typeof collectStats>>;
  try {
    result = await collectStats(createYouTubeClient(apiKey), ids);
  } catch (error) {
    if (error instanceof YouTubeSourceError) return youtubeFailure(db, job, error, "YouTube statistics");
    if (error instanceof StatsValidationError)
      throw new PipelineError("invalid_payload", error.message, false, true);
    throw error;
  }
  const { data: attempt, error: attemptError } = await db
    .from("collection_attempts")
    .insert({
      job_id: job.id,
      attempt_number: job.attempts,
      lease_token: job.lease_token,
      source_url: result.evidence.sourceUrl,
      http_status: 200,
      raw_body: result.evidence.rawBody,
      checksum: result.evidence.checksum,
    })
    .select("id")
    .single();
  check(attemptError);
  // payload_stale: every video's counts identical to the previous day.
  const previous = await db
    .from("youtube_video_statistics")
    .select("view_count,like_count,comment_count,availability,youtube_video_assets(video_id)")
    .eq("business_date", shiftDate(job.business_date, -1));
  check(previous.error);
  const previousRows: StatsRow[] = (previous.data ?? []).map((r) =>
    r.availability === "available"
      ? {
          videoId: r.youtube_video_assets?.video_id ?? "",
          availability: "available" as const,
          viewCount: String(r.view_count),
          likeCount: r.like_count === null ? null : String(r.like_count),
          commentCount: r.comment_count === null ? null : String(r.comment_count),
        }
      : { videoId: r.youtube_video_assets?.video_id ?? "", availability: r.availability as "missing" | "private" },
  );
  const comparable = previousRows.sort((a, b) => a.videoId.localeCompare(b.videoId));
  if (
    result.rows.some((r) => r.availability === "available") &&
    comparable.length === result.rows.length &&
    statsFingerprint(comparable) === result.fingerprint
  ) {
    const reviewed = await db
      .from("attempt_reviews")
      .select("id")
      .eq("job_id", job.id)
      .limit(1);
    check(reviewed.error);
    if (!reviewed.data?.length)
      throw new PipelineError(
        "payload_stale",
        "Every video has exactly yesterday's counts; review before approving.",
        false,
        true,
      );
  }
  const completed = await db.rpc("complete_youtube_stats", {
    p_job: job.id,
    p_token: job.lease_token,
    p_attempt: attempt!.id,
    p_rows: result.rows,
  });
  check(completed.error);
  return { jobId: job.id, statistics: completed.data, quotaUnits: result.quotaUnits, status: "succeeded" };
}
