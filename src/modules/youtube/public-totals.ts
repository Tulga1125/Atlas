import "server-only";
import { createPublicDataClient } from "@/lib/supabase/public-data";

// Public YouTube figures (owner, 2026-11-17, changing decision D3 for these):
// each song's total views and the artist ranking by average views per song.
// Computed in the database (public_youtube_* functions) under the v2 rule and
// inside the YouTube retention window; only verified Mongolian artists.

export async function getPublicArtistYouTube(artistId: string) {
  const { data, error } = await createPublicDataClient().rpc("public_youtube_song_totals", { p_artist: artistId });
  if (error) throw new Error(`YouTube totals unavailable: ${error.message}`);
  const songs = data.map((r) => ({ songId: r.song_id, title: r.title, views: Number(r.views), videos: r.videos, asOf: r.as_of }));
  const total = songs.reduce((n, s) => n + s.views, 0);
  return {
    songs,
    total,
    average: songs.length ? Math.round(total / songs.length) : 0,
    asOf: songs.map((s) => s.asOf).sort().at(-1) ?? null,
  };
}

export async function getPublicYouTubeRanking() {
  const { data, error } = await createPublicDataClient().rpc("public_youtube_artist_ranking");
  if (error) throw new Error(`YouTube ranking unavailable: ${error.message}`);
  return data.map((r) => ({
    rank: r.rank,
    artistId: r.artist_id,
    name: r.name,
    songs: r.songs,
    totalViews: Number(r.total_views),
    averageViews: Number(r.average_views),
    asOf: r.as_of,
  }));
}
