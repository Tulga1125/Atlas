import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/modules/operations/auth";
import { youtubePublic } from "@/lib/env";
import { getArtistYouTube, getSongYouTube, getTrackedChart } from "@/modules/youtube/surface-data";
import { trackedChartCsv, YOUTUBE_ATTRIBUTION } from "@/modules/youtube/surfaces";

// A7 YouTube endpoints (docs/API.md). Owner decision D3 keeps YouTube
// dashboard-only, so these answer signed-in staff only, unless
// ATLAS_YOUTUBE_PUBLIC=true opens them. Every read is bounded by the active
// retention window: expired YouTube data is never served.
export const dynamic = "force-dynamic";

async function client() {
  if (youtubePublic()) return { db: createAdminClient(), cache: "public, max-age=0, s-maxage=60, stale-while-revalidate=60" };
  try {
    return { db: (await requireStaff()).db, cache: "private, no-store" };
  } catch {
    return null;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join("/");
  const query = new URL(request.url).searchParams;
  const access = await client();
  // Not found rather than forbidden: the endpoints do not exist publicly.
  if (!access) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const date = query.has("date") ? z.iso.date().parse(query.get("date")) : undefined;
    if (path === "tracked-chart.csv") {
      const chart = await getTrackedChart(access.db, date);
      if (chart.expired || !chart.date) return NextResponse.json({ error: chart.expired ? "expired" : "not_found" }, { status: 404 });
      return new Response(trackedChartCsv(chart.entries), {
        headers: {
          "Cache-Control": access.cache,
          "Content-Disposition": `attachment; filename="atlas-youtube-tracked-${chart.date}.csv"`,
          "Content-Type": "text/csv; charset=utf-8",
        },
      });
    }
    let data: unknown;
    if (path === "tracked-chart") {
      const chart = await getTrackedChart(access.db, date);
      if (chart.expired) return NextResponse.json({ error: "expired" }, { status: 404 });
      data = chart;
    } else {
      const [kind, id] = (await params).path;
      if (kind === "songs" && id) data = await getSongYouTube(access.db, z.uuid().parse(id));
      else if (kind === "artists" && id) data = await getArtistYouTube(access.db, z.uuid().parse(id));
    }
    if (data === undefined) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ apiVersion: "1", source: YOUTUBE_ATTRIBUTION, data }, { headers: { "Cache-Control": access.cache } });
  } catch (error) {
    const invalid = error instanceof z.ZodError;
    return NextResponse.json({ error: invalid ? "invalid_request" : "data_unavailable" }, { status: invalid ? 400 : 503 });
  }
}
