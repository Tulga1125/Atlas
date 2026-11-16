import { z } from "zod";
import { getCurrentChartSnapshot } from "@/modules/charts/current";
import { toChartCsv } from "@/modules/charts/public-response";
import { ChartDataError } from "@/modules/charts/repository";

export const dynamic = "force-dynamic";

const dateSchema = z.iso.date();

export async function GET(request: Request) {
  const dateValue = new URL(request.url).searchParams.get("date");
  const dateResult = dateValue ? dateSchema.safeParse(dateValue) : null;

  if (dateResult && !dateResult.success) {
    return Response.json({ error: "invalid_date" }, { status: 400 });
  }

  try {
    const snapshot = await getCurrentChartSnapshot(dateResult?.data);
    return new Response(toChartCsv(snapshot), {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
        "Content-Disposition": `attachment; filename="atlas-apple-music-mongolia-${snapshot.date}.csv"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    if (error instanceof ChartDataError) {
      return Response.json(
        { error: `chart_${error.code}` },
        { status: error.code === "not_found" ? 404 : 503 },
      );
    }

    return Response.json({ error: "chart_unavailable" }, { status: 503 });
  }
}
