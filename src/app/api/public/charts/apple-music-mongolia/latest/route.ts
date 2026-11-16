import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentChartSnapshot } from "@/modules/charts/current";
import { toPublicChartResponse } from "@/modules/charts/public-response";
import { ChartDataError } from "@/modules/charts/repository";

export const dynamic = "force-dynamic";

const dateSchema = z.iso.date();

export async function GET(request: Request) {
  const dateValue = new URL(request.url).searchParams.get("date");
  const dateResult = dateValue ? dateSchema.safeParse(dateValue) : null;

  if (dateResult && !dateResult.success) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  try {
    const snapshot = await getCurrentChartSnapshot(dateResult?.data);
    return NextResponse.json(toPublicChartResponse(snapshot), {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    if (error instanceof ChartDataError) {
      const status = error.code === "not_found" ? 404 : 503;
      return NextResponse.json(
        { error: `chart_${error.code}` },
        { status },
      );
    }

    return NextResponse.json({ error: "chart_unavailable" }, { status: 503 });
  }
}
