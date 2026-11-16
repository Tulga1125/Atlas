import { isCronRequest } from "@/modules/operations/auth";
import { NextResponse } from "next/server";
import {
  getMissingCollectorConfiguration,
  getServerEnvironment,
} from "@/lib/env";
import { collectAppleMusicMongolia } from "@/modules/collection/collect-apple-music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const missingConfiguration = getMissingCollectorConfiguration();

  if (missingConfiguration.length > 0) {
    return NextResponse.json(
      {
        error: "collector_not_configured",
        missing: missingConfiguration,
      },
      { status: 503 },
    );
  }

  getServerEnvironment();

  try {
    const result = await collectAppleMusicMongolia();
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    console.error(
      "Atlas collection enqueue failed",
      error instanceof Error ? error.message : "Unknown failure",
    );
    return NextResponse.json({ error: "collection_failed" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
