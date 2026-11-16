import { NextResponse } from "next/server";
import {
  getArtistCollectorEnvironment,
  getMissingArtistCollectorConfiguration,
} from "@/lib/env";
import { collectArtistIntelligence } from "@/modules/collection/collect-artist-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const missingConfiguration = getMissingArtistCollectorConfiguration();

  if (missingConfiguration.length > 0) {
    return NextResponse.json(
      {
        error: "artist_collector_not_configured",
        missing: missingConfiguration,
      },
      { status: 503 },
    );
  }

  const environment = getArtistCollectorEnvironment();
  if (
    !environment.APPLE_MUSIC_DEVELOPER_TOKEN &&
    !environment.YOUTUBE_API_KEY
  ) {
    return NextResponse.json(
      {
        error: "artist_sources_not_configured",
        missing: ["APPLE_MUSIC_DEVELOPER_TOKEN", "YOUTUBE_API_KEY"],
      },
      { status: 503 },
    );
  }

  try {
    const result = await collectArtistIntelligence();
    const reused = result.sources.every((source) => source.reused);
    return NextResponse.json(result, { status: reused ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown artist collection failure";
    return NextResponse.json(
      { error: "artist_collection_failed", message },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
