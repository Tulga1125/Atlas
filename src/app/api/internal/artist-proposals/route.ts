import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronRequest } from "@/modules/operations/auth";
import { generateArtistProposals } from "@/modules/artist-review/generate-proposals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Drafts artist proposals for new names on the latest Apple chart (scheduled 06:20 Ulaanbaatar). */
export async function POST(request: Request) {
  if (!isCronRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await generateArtistProposals(createAdminClient(), process.env.YOUTUBE_API_KEY));
  } catch (error) {
    console.error("Artist proposals failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "proposals_failed" }, { status: 500 });
  }
}
