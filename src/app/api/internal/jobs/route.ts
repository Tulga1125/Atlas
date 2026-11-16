import { NextResponse } from "next/server";
import { requireStaff } from "@/modules/operations/auth";
export async function GET(request: Request) {
  try {
    const { db } = await requireStaff();
    const id = new URL(request.url).searchParams.get("id");
    let query = db
      .from("pipeline_jobs")
      .select(
        "id,kind,business_date,status,attempts,error_code,error_message,created_at,completed_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (id) query = query.eq("id", id);
    const { data, error } = await query;
    if (error) throw new Error("query_failed");
    return NextResponse.json(
      { jobs: data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unavailable" },
      { status: 403 },
    );
  }
}
