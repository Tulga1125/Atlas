import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentChartSnapshot } from "@/modules/charts/current";
import {
  getArchive,
  compareCharts,
  getSongHistory,
} from "@/modules/charts/history";
import { toPublicChartResponse } from "@/modules/charts/public-response";
import { getArtistById } from "@/modules/artists/current";
import { getPublications, getPublication } from "@/modules/newsroom/public";
import { createPublicDataClient } from "@/lib/supabase/public-data";
import { ChartDataError } from "@/modules/charts/repository";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ resource: string[] }> },
) {
  const parts = (await params).resource,
    query = new URL(request.url).searchParams;
  const date = (key: string) => z.iso.date().parse(query.get(key));
  try {
    let data: unknown;
    if (parts.join("/") === "charts")
      data = {
        charts: [
          {
            id: "apple-music-mongolia",
            source: "apple_music",
            country: "MN",
            frequency: "daily",
          },
        ],
      };
    else if (
      parts[0] === "charts" &&
      parts[1] === "apple-music-mongolia" &&
      parts.length === 3
    ) {
      if (parts[2] === "history")
        data = await getArchive(query.get("before") ?? undefined);
      else if (parts[2] === "compare")
        data = await compareCharts(date("from"), date("to"));
      else if (parts[2] === "latest")
        data = toPublicChartResponse(
          await getCurrentChartSnapshot(
            query.has("date") ? date("date") : undefined,
          ),
        );
      else if (parts[2] === "movers") {
        const chart = await getCurrentChartSnapshot(
          query.has("date") ? date("date") : undefined,
        );
        data = {
          snapshotId: chart.id,
          date: chart.date,
          entries: chart.entries
            .filter((e) => e.rankChange !== null)
            .sort(
              (a, b) =>
                Math.abs(b.rankChange ?? 0) - Math.abs(a.rankChange ?? 0),
            ),
        };
      }
    } else if (parts[0] === "songs" && parts.length === 2)
      data = await getSongHistory(parts[1]);
    else if (parts[0] === "artists" && parts.length === 2)
      data = await getArtistById(parts[1]);
    else if (parts[0] === "articles" && parts.length <= 2)
      data = parts[1]
        ? await getPublication(parts[1])
        : await getPublications(query.get("cursor") ?? undefined);
    else if (parts.join("/") === "search") {
      const term = z.string().trim().min(2).max(80).parse(query.get("q"));
        const { data: rows, error } = await createPublicDataClient().rpc(
          "search_catalog",
          {
            p_query: term,
            p_after: query.has("cursor")
              ? z.uuid().parse(query.get("cursor"))
              : undefined,
          },
        );
        if (error) throw error;
        data = {
          results: rows.slice(0, 50),
          nextCursor: rows.length > 50 ? rows[49].id : null,
        };
    }
    if (data === undefined || data === null)
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(
      { apiVersion: "1", data },
      {
        headers: {
          "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60",
        },
      },
    );
  } catch (error) {
    const invalid = error instanceof z.ZodError;
    const missing =
      error instanceof ChartDataError && error.code === "not_found";
    return NextResponse.json(
      {
        error: invalid
          ? "invalid_request"
          : missing
            ? "not_found"
            : "data_unavailable",
      },
      { status: invalid ? 400 : missing ? 404 : 503 },
    );
  }
}
