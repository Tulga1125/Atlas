import "server-only";
import { redirect } from "next/navigation";
import { requireStaff } from "./auth";
import { cache } from "react";
import { z } from "zod";
export const staffContext = cache(async function staffContext() {
  try {
    const { db, profile } = await requireStaff();
    return {
      db,
      profile: {
        id: profile.id,
        displayName: profile.display_name ?? "Atlas",
        role: profile.role,
      },
    };
  } catch {
    redirect("/login?error=access_denied");
  }
});
const nullable = z.string().nullable();
export const jobRow = z.object({
  id: z.string(),
  kind: z.string(),
  business_date: z.string(),
  status: z.string(),
  attempts: z.number(),
  error_code: nullable,
  error_message: nullable,
  created_at: z.string(),
  snapshot_id: nullable,
});
export const signalRow = z.object({
  id: z.string(),
  signal_type: z.string(),
  headline_summary: z.string(),
  status: z.string(),
  severity: z.string(),
  snapshot_id: z.string(),
  signal_evidence: z
    .array(z.object({ payload: z.unknown(), chart_entry_id: nullable }))
    .optional(),
});
export const anomalyRow = z.object({
  id: z.string(),
  summary: z.string(),
  status: z.string(),
  severity: z.string(),
  evidence: z.unknown(),
});
export const storyRow = z.object({
  id: z.string(),
  headline: z.string(),
  angle: z.string(),
  status: z.string(),
  priority: z.string(),
  revision: z.number(),
  assigned_to: nullable,
  supporting_facts: z.unknown(),
});
export const songRow = z.object({
  id: z.string(),
  canonical_title: z.string(),
  primary_artist_id: nullable,
  verification: z.string(),
  locality: z.string(),
  language: nullable,
  genre: nullable,
  redirect_to: nullable,
});
export async function operationsData(
  db: NonNullable<Awaited<ReturnType<typeof staffContext>>["db"]>,
  page = 1,
  term = "",
) {
  const offset = (page - 1) * 50;
  const search = term
    .trim()
    .slice(0, 80)
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  const responses = await Promise.all([
    db
      .from("pipeline_jobs")
      .select(
        "id,kind,business_date,status,attempts,error_code,error_message,created_at,snapshot_id",
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + 49),
    db
      .from("signals")
      .select(
        "id,signal_type,headline_summary,status,severity,snapshot_id,signal_evidence(payload,chart_entry_id)",
      )
      .order("detected_at", { ascending: false })
      .range(offset, offset + 49),
    db
      .from("anomaly_alerts")
      .select("id,summary,status,severity,evidence")
      .in("status", ["open", "reviewing", "data_error"])
      .order("detected_at", { ascending: false })
      .range(offset, offset + 49),
    db
      .from("story_leads")
      .select(
        "id,headline,angle,status,priority,revision,assigned_to,supporting_facts",
      )
      .order("updated_at", { ascending: false })
      .range(offset, offset + 49),
    db
      .from("songs")
      .select(
        "id,canonical_title,primary_artist_id,verification,locality,language,genre,redirect_to",
      )
      .ilike("canonical_title", `%${search}%`)
      .order("canonical_title")
      .order("id")
      .range(offset, offset + 49),
    db
      .from("daily_briefs")
      .select("id,body_mn,snapshot_id,created_at")
      .order("created_at", { ascending: false })
      .limit(7),
    db
      .from("profiles")
      .select("id,display_name,role")
      .eq("active", true)
      .order("display_name"),
    db
      .from("artists")
      .select("id,canonical_name")
      .order("canonical_name")
      .limit(1000),
  ]);
  for (const response of responses)
    if (response.error) throw new Error("Unable to load newsroom data");
  return {
    artists: z
      .array(z.object({ id: z.string(), canonical_name: z.string() }))
      .parse(responses[7].data),
    jobs: z.array(jobRow).parse(responses[0].data),
    signals: z.array(signalRow).parse(responses[1].data),
    anomalies: z.array(anomalyRow).parse(responses[2].data),
    stories: z.array(storyRow).parse(responses[3].data),
    songs: z.array(songRow).parse(responses[4].data),
    briefs: z
      .array(
        z.object({
          id: z.string(),
          body_mn: z.string(),
          snapshot_id: z.string(),
          created_at: z.string(),
        }),
      )
      .parse(responses[5].data),
    people: z
      .array(
        z.object({ id: z.string(), display_name: nullable, role: z.string() }),
      )
      .parse(responses[6].data),
  };
}
export const emptyOperations = {
  artists: [],
  jobs: [],
  signals: [],
  anomalies: [],
  stories: [],
  songs: [],
  briefs: [],
  people: [],
};
