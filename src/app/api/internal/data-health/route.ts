import { shiftDate } from "@/modules/analytics/calculate";
import { NextResponse } from "next/server";
import { isCronRequest, requireStaff } from "@/modules/operations/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAtlasBusinessDate } from "@/modules/collection/business-date";
export async function GET(request: Request) {
  let db;
  try {
    db = isCronRequest(request)
      ? createAdminClient()
      : (await requireStaff()).db;
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }
  try {
    const [snapshot, jobs, youtube] = await Promise.all([
      db
        .from("chart_snapshots")
        .select("id,snapshot_date,collected_at")
        .eq("status", "approved")
        .order("snapshot_date", { ascending: false })
        .limit(1),
      db
        .from("pipeline_jobs")
        .select("id,kind,status,error_code,business_date")
        .in("status", ["failed", "review", "running"])
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("pipeline_jobs")
        .select("id,business_date,status,error_code,error_message,completed_at")
        .eq("kind", "youtube_daily_stats")
        .order("business_date", { ascending: false })
        .limit(1),
    ]);
    if (snapshot.error || jobs.error || youtube.error) throw new Error("health_unavailable");
    const latest = snapshot.data?.[0],
      today = getAtlasBusinessDate(),
      afterDeadline =
        new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          hourCycle: "h23",
          timeZone: "Asia/Ulaanbaatar",
        }).format(new Date()) >= "07";
    const brief = latest
      ? await db
          .from("daily_briefs")
          .select("id")
          .eq("snapshot_id", latest.id)
          .limit(1)
      : { data: [], error: null };
    if (brief.error) throw new Error("health_unavailable");
    const healthy =
      !!latest &&
      (latest.snapshot_date === today ||
        (!afterDeadline && latest.snapshot_date === shiftDate(today, -1))) &&
      !!brief.data?.length &&
      !(jobs.data ?? []).some(
        (j) =>
          j.business_date === today && ["failed", "review"].includes(j.status),
      );
    return NextResponse.json(
      {
        healthy,
        latest: latest ?? null,
        briefReady: !!brief.data?.length,
        jobs: jobs.data,
        // YouTube is reported, not gated: Apple freshness decides "healthy".
        youtube: youtube.data?.[0]
          ? {
              ...youtube.data[0],
              fresh: youtube.data[0].business_date === today && youtube.data[0].status === "succeeded",
              partial: youtube.data[0].error_code === "partial",
            }
          : null,
      },
      {
        status: healthy ? 200 : 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch {
    return NextResponse.json({ error: "health_unavailable" }, { status: 503 });
  }
}
