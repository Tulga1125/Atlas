import { createPublicDataClient } from "@/lib/supabase/public-data";
import { getSongHistory } from "@/modules/charts/history";
import "server-only";

import { getMissingPublicDataConfiguration } from "@/lib/env";
import { getLiveArtistDirectory } from "./repository";
import type { ArtistDetail, ArtistSummary } from "./types";

export async function getArtistDirectory(): Promise<ArtistSummary[]> {
  const missingConfiguration = getMissingPublicDataConfiguration();
  if (missingConfiguration.length > 0) {
    throw new Error(
      `Public artist data is not configured: ${missingConfiguration.join(", ")}`,
    );
  }

  return getLiveArtistDirectory();
}

export async function getArtistById(
  artistId: string,
): Promise<ArtistDetail | null> {
  const artists = await getArtistDirectory();
  const artist = artists.find((candidate) => candidate.id === artistId);

  if (!artist) {
    return null;
  }

    const { data: credits, error } = await createPublicDataClient()
      .from("song_artists")
      .select("song_id")
      .eq("artist_id", artistId);
    if (error) throw new Error("Artist discography unavailable");
    const songs = await Promise.all(
      (credits ?? []).map((c) => getSongHistory(c.song_id)),
    );
    return {
      ...artist,
      currentSongs: songs
        .filter(
          (s): s is NonNullable<typeof s> =>
            s !== null && !s.redirectTo && s.daysOnChart > 0,
        )
        .map((s) => ({
          id: s.id,
          title: s.title,
          currentRank: s.currentRank,
          peakRank: s.peakRank!,
          daysOnChart: s.daysOnChart,
        }))
        .sort((a, b) => (a.currentRank ?? 101) - (b.currentRank ?? 101)),
    };
}
