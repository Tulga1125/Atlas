import { NextResponse } from "next/server";
import { isCronRequest } from "@/modules/operations/auth";
import { runNextJob } from "@/modules/operations/worker";
import { revalidatePath, revalidateTag } from "next/cache";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!isCronRequest(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await runNextJob();
    if ("status" in result && result.status === "succeeded") {
      revalidateTag("atlas-charts", { expire: 0 });
      revalidatePath("/", "layout");
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(
      "Atlas worker unavailable",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json({ error: "worker_unavailable" }, { status: 503 });
  }
}
