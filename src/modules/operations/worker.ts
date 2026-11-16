import { createAdminClient } from "@/lib/supabase/admin";
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
import { z } from "zod";

const jobSchema = z.object({
  id: z.string(),
  kind: z.enum(["collect", "calculate", "artists"]),
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
