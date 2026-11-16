import "server-only";

import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ChartSnapshot } from "@/modules/charts/types";
import { staffRoles, type DashboardData, type DashboardStory } from "./types";

const severitySchema = z.enum(["low", "medium", "high", "critical"]);
const databaseUuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const profileSchema = z.object({
  id: databaseUuid,
  display_name: z.string().nullable(),
  role: z.enum(staffRoles),
  active: z.boolean(),
});

const signalSchema = z.object({
  id: databaseUuid,
  signal_type: z.string(),
  severity: severitySchema,
  headline_summary: z.string(),
  status: z.string(),
  detected_at: z.iso.datetime({ offset: true }),
});

const anomalySchema = z.object({
  id: databaseUuid,
  severity: severitySchema,
  summary: z.string(),
  status: z.string(),
  detected_at: z.iso.datetime({ offset: true }),
});

const storySchema = z.object({
  id: databaseUuid,
  headline: z.string(),
  angle: z.string(),
  priority: z.enum(["urgent", "high", "normal", "low"]),
  status: z.string(),
});

const jobSchema = z.object({
  status: z.string(),
  scheduled_for: z.iso.datetime({ offset: true }),
  completed_at: z.iso.datetime({ offset: true }).nullable(),
  items_received: z.number().int().nullable(),
  attempt_number: z.number().int().positive(),
  error_message: z.string().nullable(),
});

const calculationSchema = z.object({ status: z.string() });

export class StaffAccessError extends Error {
  constructor(
    public readonly code: "unauthenticated" | "inactive" | "query_failed",
  ) {
    super(code);
    this.name = "StaffAccessError";
  }
}

function queryError(label: string, message?: string) {
  console.error(`Atlas dashboard query failed: ${label}`, message);
  return new StaffAccessError("query_failed");
}

export async function getDashboardData(
  snapshot: ChartSnapshot,
): Promise<DashboardData> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const subject = claimsData?.claims?.sub;

  if (claimsError || typeof subject !== "string") {
    throw new StaffAccessError("unauthenticated");
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id,display_name,role,active")
    .eq("id", subject)
    .maybeSingle();

  if (profileError) {
    throw queryError("profile", profileError.message);
  }

  if (!profileData || !profileData.active) {
    throw new StaffAccessError("inactive");
  }

  const profile = profileSchema.parse(profileData);
  const activeSignalStatuses = ["new", "under_review", "confirmed"] as const;
  const activeAnomalyStatuses = ["open", "reviewing"] as const;
  const activeStoryStatuses = [
    "detected",
    "needs_verification",
    "verified",
    "assigned",
    "drafting",
    "editing",
    "approved",
  ] as const;

  const [
    signalResponse,
    anomalyResponse,
    storyResponse,
    jobResponse,
    reviewResponse,
    calculationResponse,
  ] = await Promise.all([
    supabase
      .from("signals")
      .select("id,signal_type,severity,headline_summary,status,detected_at", {
        count: "exact",
      })
      .eq("snapshot_id", snapshot.id)
      .in("status", activeSignalStatuses)
      .order("detected_at", { ascending: false })
      .limit(12),
    supabase
      .from("anomaly_alerts")
      .select("id,severity,summary,status,detected_at", { count: "exact" })
      .eq("chart_id", snapshot.chartId)
      .in("status", activeAnomalyStatuses)
      .order("detected_at", { ascending: false })
      .limit(12),
    supabase
      .from("story_leads")
      .select("id,headline,angle,priority,status", { count: "exact" })
      .in("status", activeStoryStatuses)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("collection_jobs")
      .select(
        "status,scheduled_for,completed_at,items_received,attempt_number,error_message",
      )
      .eq("chart_id", snapshot.chartId)
      .order("scheduled_for", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("entity_match_reviews")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    supabase
      .from("calculation_runs")
      .select("status")
      .eq("snapshot_id", snapshot.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const responses = [
    ["signals", signalResponse.error],
    ["anomalies", anomalyResponse.error],
    ["story leads", storyResponse.error],
    ["collection job", jobResponse.error],
    ["identity reviews", reviewResponse.error],
    ["calculation run", calculationResponse.error],
  ] as const;

  for (const [label, error] of responses) {
    if (error) {
      throw queryError(label, error.message);
    }
  }

  const signals = z
    .array(signalSchema)
    .parse(signalResponse.data)
    .map((signal) => ({
      id: signal.id,
      type: signal.signal_type,
      severity: signal.severity,
      headline: signal.headline_summary,
      status: signal.status,
      detectedAt: signal.detected_at,
    }));
  const anomalies = z
    .array(anomalySchema)
    .parse(anomalyResponse.data)
    .map((anomaly) => ({
      id: anomaly.id,
      severity: anomaly.severity,
      summary: anomaly.summary,
      status: anomaly.status,
      detectedAt: anomaly.detected_at,
    }));
  const storyLeads = z.array(storySchema).parse(storyResponse.data);
  const signalStories: DashboardStory[] = signals.map((signal) => ({
    id: signal.id,
    headline: signal.headline,
    detail: `${signal.type.replaceAll("_", " ")} · ${signal.status.replaceAll("_", " ")}`,
    priority:
      signal.severity === "critical"
        ? "urgent"
        : signal.severity === "high"
          ? "high"
          : "normal",
    status: signal.status,
    source: "signal",
  }));
  const stories: DashboardStory[] = [
    ...storyLeads.map((story) => ({
      id: story.id,
      headline: story.headline,
      detail: story.angle,
      priority: story.priority,
      status: story.status,
      source: "story_lead" as const,
    })),
    ...signalStories,
  ].slice(0, 6);

  const latestJob = jobResponse.data
    ? (() => {
        const job = jobSchema.parse(jobResponse.data);
        return {
          status: job.status,
          scheduledFor: job.scheduled_for,
          completedAt: job.completed_at,
          itemsReceived: job.items_received,
          attemptNumber: job.attempt_number,
          errorMessage: job.error_message,
        };
      })()
    : null;

  return {
    profile: {
      id: profile.id,
      displayName: profile.display_name ?? "Atlas team",
      role: profile.role,
    },
    signals,
    anomalies,
    stories,
    latestJob,
    calculationStatus: calculationResponse.data
      ? calculationSchema.parse(calculationResponse.data).status
      : null,
    openIdentityReviews: reviewResponse.count ?? 0,
    counts: {
      signals: signalResponse.count ?? signals.length,
      anomalies: anomalyResponse.count ?? anomalies.length,
      stories: storyResponse.count ?? storyLeads.length,
      identityReviews: reviewResponse.count ?? 0,
    },
  };
}
