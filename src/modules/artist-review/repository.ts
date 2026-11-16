import "server-only";

import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ChartSnapshot } from "@/modules/charts/types";
import {
  artistEvidenceTypes,
  artistLocalities,
  artistTypes,
  artistVerificationStatuses,
  type ArtistReviewFilter,
  type ArtistReviewQueue,
  type ReviewArtist,
} from "./types";

const databaseUuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const artistRowSchema = z.object({
  id: databaseUuid,
  canonical_name: z.string().min(1),
  source_key: z.string().nullable(),
  country_code: z.string().nullable(),
  locality: z.enum(artistLocalities),
  artist_type: z.enum(artistTypes),
  verification: z.enum(artistVerificationStatuses),
  image_url: z.string().nullable(),
  biography: z.string().nullable(),
  updated_at: z.iso.datetime({ offset: true }),
});

const profileRowSchema = z.object({
  id: databaseUuid,
  artist_id: databaseUuid,
  platform_id: databaseUuid,
  platform_artist_id: z.string().min(1),
  profile_url: z.httpUrl().nullable(),
  match_status: z.enum(artistVerificationStatuses),
});

const platformRowSchema = z.object({
  id: databaseUuid,
  code: z.string().min(1),
  name: z.string().min(1),
});

const evidenceRowSchema = z.object({
  id: databaseUuid,
  artist_id: databaseUuid,
  evidence_type: z.enum(artistEvidenceTypes),
  source_url: z.httpUrl().nullable(),
  notes: z.string().nullable(),
  supports_locality: z.enum(artistLocalities).nullable(),
  supports_country_code: z.string().nullable(),
  verified_at: z.iso.datetime({ offset: true }).nullable(),
  created_at: z.iso.datetime({ offset: true }),
});

function reviewQueryError(label: string, message: string) {
  console.error(`Atlas artist review query failed: ${label}`, message);
  return new Error("artist_review_query_failed");
}

function applyFilter(
  artists: ReviewArtist[],
  filter: ArtistReviewFilter,
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return artists.filter((artist) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "needs_review" &&
        ["suggested", "unverified"].includes(artist.verification)) ||
      (filter === "verified" && artist.verification === "verified") ||
      (filter === "disputed" && artist.verification === "disputed");
    const matchesQuery =
      !normalizedQuery ||
      artist.canonicalName.toLocaleLowerCase().includes(normalizedQuery) ||
      artist.sourceKey?.toLocaleLowerCase().includes(normalizedQuery);

    return matchesFilter && Boolean(matchesQuery);
  });
}

async function getLiveReviewArtists(
  snapshot: ChartSnapshot | null,
  artistId?: string,
): Promise<ReviewArtist[]> {
  const supabase = await createServerSupabaseClient();
  let artistQuery = supabase
    .from("artists")
    .select(
      "id,canonical_name,source_key,country_code,locality,artist_type,verification,image_url,biography,updated_at",
    );

  artistQuery = artistId
    ? artistQuery.eq("id", artistId)
    : artistQuery.order("updated_at", { ascending: false }).limit(500);

  const { data: artistData, error: artistError } = await artistQuery;
  if (artistError) {
    throw reviewQueryError("artists", artistError.message);
  }

  const artists = z.array(artistRowSchema).parse(artistData);
  if (artists.length === 0) {
    return [];
  }

  const artistIds = artists.map((artist) => artist.id);
  const [profileResponse, evidenceResponse] = await Promise.all([
    supabase
      .from("artist_platform_profiles")
      .select(
        "id,artist_id,platform_id,platform_artist_id,profile_url,match_status",
      )
      .in("artist_id", artistIds),
    supabase
      .from("artist_verification_evidence")
      .select(
        "id,artist_id,evidence_type,source_url,notes,supports_locality,supports_country_code,verified_at,created_at",
      )
      .in("artist_id", artistIds)
      .order("created_at", { ascending: false }),
  ]);

  if (profileResponse.error) {
    throw reviewQueryError("platform profiles", profileResponse.error.message);
  }
  if (evidenceResponse.error) {
    throw reviewQueryError(
      "verification evidence",
      evidenceResponse.error.message,
    );
  }

  const profileRows = z.array(profileRowSchema).parse(profileResponse.data);
  const evidenceRows = z.array(evidenceRowSchema).parse(evidenceResponse.data);
  const platformIds = [
    ...new Set(profileRows.map((profile) => profile.platform_id)),
  ];
  const platformResponse = platformIds.length
    ? await supabase
        .from("platforms")
        .select("id,code,name")
        .in("id", platformIds)
    : { data: [], error: null };

  if (platformResponse.error) {
    throw reviewQueryError("platform names", platformResponse.error.message);
  }

  const platforms = new Map(
    z
      .array(platformRowSchema)
      .parse(platformResponse.data)
      .map((platform) => [platform.id, platform]),
  );
  const chartByArtist = new Map<
    string,
    { currentRank: number; currentSongCount: number }
  >();
  if (snapshot) {
    const { data: credits, error } = await supabase
      .from("song_artists")
      .select("song_id,artist_id")
      .in(
        "song_id",
        snapshot.entries.map((e) => e.songId),
      );
    if (error) throw reviewQueryError("chart credits", error.message);
    for (const artist of artists) {
      const ids = new Set(
        credits?.filter((c) => c.artist_id === artist.id).map((c) => c.song_id),
      );
      const songs = snapshot.entries.filter((e) => ids.has(e.songId));
      if (songs.length)
        chartByArtist.set(artist.id, {
          currentRank: Math.min(...songs.map((e) => e.rank)),
          currentSongCount: new Set(songs.map((e) => e.songId)).size,
        });
    }
  }

  return artists.map((artist): ReviewArtist => {
    const chart = chartByArtist.get(artist.id);

    return {
      id: artist.id,
      canonicalName: artist.canonical_name,
      sourceKey: artist.source_key,
      countryCode: artist.country_code,
      locality: artist.locality,
      artistType: artist.artist_type,
      verification: artist.verification,
      imageUrl: artist.image_url,
      biography: artist.biography,
      updatedAt: artist.updated_at,
      currentRank: chart?.currentRank ?? null,
      currentSongCount: chart?.currentSongCount ?? 0,
      profiles: profileRows
        .filter((profile) => profile.artist_id === artist.id)
        .flatMap((profile) => {
          const platform = platforms.get(profile.platform_id);
          return platform
            ? [
                {
                  id: profile.id,
                  platformCode: platform.code,
                  platformName: platform.name,
                  platformArtistId: profile.platform_artist_id,
                  profileUrl: profile.profile_url,
                  matchStatus: profile.match_status,
                },
              ]
            : [];
        }),
      evidence: evidenceRows
        .filter((evidence) => evidence.artist_id === artist.id)
        .map((evidence) => ({
          id: evidence.id,
          type: evidence.evidence_type,
          sourceUrl: evidence.source_url,
          notes: evidence.notes,
          supportsLocality: evidence.supports_locality,
          supportsCountryCode: evidence.supports_country_code,
          verifiedAt: evidence.verified_at,
          createdAt: evidence.created_at,
        })),
    };
  });
}

function queueCounts(artists: ReviewArtist[]) {
  return {
    total: artists.length,
    needsReview: artists.filter((artist) =>
      ["suggested", "unverified"].includes(artist.verification),
    ).length,
    verifiedLocal: artists.filter(
      (artist) =>
        artist.verification === "verified" && artist.locality === "local",
    ).length,
    disputed: artists.filter((artist) => artist.verification === "disputed")
      .length,
    youtubeLinked: artists.filter((artist) =>
      artist.profiles.some((profile) => profile.platformCode === "youtube"),
    ).length,
  };
}

export async function getArtistReviewQueue(
  snapshot: ChartSnapshot | null,
  filter: ArtistReviewFilter = "needs_review",
  query = "",
): Promise<ArtistReviewQueue> {
  const allArtists = await getLiveReviewArtists(snapshot);
  return {
    artists: applyFilter(allArtists, filter, query),
    counts: queueCounts(allArtists),
  };
}

export async function getArtistForReview(
  snapshot: ChartSnapshot | null,
  artistId: string,
): Promise<ReviewArtist | null> {
  if (!databaseUuid.safeParse(artistId).success) {
    return null;
  }

  return (await getLiveReviewArtists(snapshot, artistId))[0] ?? null;
}
