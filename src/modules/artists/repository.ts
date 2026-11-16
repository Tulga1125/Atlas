import "server-only";

import { z } from "zod";
import { createPublicDataClient } from "@/lib/supabase/public-data";
import type {
  ArtistChartStats,
  ArtistMetric,
  ArtistProfileLink,
  ArtistSummary,
} from "./types";

const CHART_ID = "00000000-0000-0000-0000-000000000010";
const databaseUuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const artistRowSchema = z.object({
  id: databaseUuid,
  canonical_name: z.string().min(1),
  image_url: z.string().nullable(),
  biography: z.string().nullable(),
});

const careerRowSchema = z.object({
  artist_id: databaseUuid,
  first_chart_date: z.iso.date(),
  latest_chart_date: z.iso.date(),
  charting_days: z.coerce.number().int().nonnegative(),
  songs_charted: z.coerce.number().int().nonnegative(),
  peak_rank: z.coerce.number().int().positive(),
  top_ten_entry_days: z.coerce.number().int().nonnegative(),
  number_one_entry_days: z.coerce.number().int().nonnegative(),
  total_entry_days: z.coerce.number().int().nonnegative(),
});

const dailyRowSchema = z.object({
  artist_id: databaseUuid,
  snapshot_date: z.iso.date(),
  charting_songs: z.coerce.number().int().nonnegative(),
  best_rank: z.coerce.number().int().positive(),
});

const metricRowSchema = z.object({
  artist_id: databaseUuid,
  platform_code: z.string().min(1),
  platform_name: z.string().min(1),
  metric_date: z.iso.date(),
  metric_name: z.enum(["subscribers", "total_views", "video_count"]),
  metric_value: z.coerce.number().nonnegative(),
  unit: z.enum(["people", "views", "videos"]),
  scope: z.string().min(1),
});

const profileMetadataSchema = z
  .object({
    artworkUrl: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    biography: z.string().nullable().optional(),
    genres: z.array(z.string()).optional(),
    identitySourceUrl: z.url().refine(value => ["http:", "https:"].includes(new URL(value).protocol)).nullable().optional(),
    identitySourceName: z.string().nullable().optional(),
  })
  .passthrough();

const profileRowSchema = z.object({
  artist_id: databaseUuid,
  platform_id: databaseUuid,
  profile_url: z.string().nullable(),
  metadata: profileMetadataSchema,
});

const platformRowSchema = z.object({
  id: databaseUuid,
  code: z.string().min(1),
  name: z.string().min(1),
});

function emptyStats(): ArtistChartStats {
  return {
    firstChartDate: null,
    latestChartDate: null,
    chartingDays: 0,
    songsCharted: 0,
    peakRank: null,
    topTenEntryDays: 0,
    numberOneEntryDays: 0,
    totalEntryDays: 0,
  };
}

function queryError(label: string, message: string) {
  return new Error(`${label}: ${message}`);
}

export async function getLiveArtistDirectory(): Promise<ArtistSummary[]> {
  const supabase = createPublicDataClient();
  const { data: artistData, error: artistError } = await supabase
    .from("artists")
    .select("id,canonical_name,image_url,biography")
    .eq("country_code", "MN")
    .eq("locality", "local")
    .eq("verification", "verified")
    .is("redirect_to", null)
    .order("canonical_name", { ascending: true });

  if (artistError) {
    throw queryError("Unable to load verified artists", artistError.message);
  }

  const artists = z.array(artistRowSchema).parse(artistData);
  if (artists.length === 0) {
    return [];
  }

  const artistIds = artists.map((artist) => artist.id);
  const [
    careerResponse,
    dailyResponse,
    metricResponse,
    profileResponse,
    latestResponse,
  ] = await Promise.all([
    supabase
      .from("artist_chart_career_stats")
      .select(
        "artist_id,first_chart_date,latest_chart_date,charting_days,songs_charted,peak_rank,top_ten_entry_days,number_one_entry_days,total_entry_days",
      )
      .eq("chart_id", CHART_ID)
      .in("artist_id", artistIds),
    supabase
      .from("artist_chart_daily_stats")
      .select("artist_id,snapshot_date,charting_songs,best_rank")
      .eq("chart_id", CHART_ID)
      .in("artist_id", artistIds)
      .order("snapshot_date", { ascending: false }),
    supabase
      .from("artist_latest_metrics")
      .select(
        "artist_id,platform_code,platform_name,metric_date,metric_name,metric_value,unit,scope",
      )
      .in("artist_id", artistIds),
    supabase
      .from("artist_platform_profiles")
      .select("artist_id,platform_id,profile_url,metadata")
      .in("artist_id", artistIds),
    supabase
      .from("chart_snapshots")
      .select("snapshot_date")
      .eq("status", "approved")
      .order("snapshot_date", { ascending: false })
      .limit(1),
  ]);

  if (latestResponse.error)
    throw queryError(
      "Unable to load current chart date",
      latestResponse.error.message,
    );
  if (careerResponse.error) {
    throw queryError(
      "Unable to load artist chart history",
      careerResponse.error.message,
    );
  }
  if (dailyResponse.error) {
    throw queryError(
      "Unable to load current artist ranks",
      dailyResponse.error.message,
    );
  }
  if (metricResponse.error) {
    throw queryError(
      "Unable to load artist metrics",
      metricResponse.error.message,
    );
  }
  if (profileResponse.error) {
    throw queryError(
      "Unable to load artist profiles",
      profileResponse.error.message,
    );
  }

  const careers = z.array(careerRowSchema).parse(careerResponse.data);
  const dailyRows = z.array(dailyRowSchema).parse(dailyResponse.data);
  const metrics = z.array(metricRowSchema).parse(metricResponse.data);
  const profiles = z.array(profileRowSchema).parse(profileResponse.data);
  const platformIds = [
    ...new Set(profiles.map((profile) => profile.platform_id)),
  ];
  const platformResponse = platformIds.length
    ? await supabase
        .from("platforms")
        .select("id,code,name")
        .in("id", platformIds)
    : { data: [], error: null };

  if (platformResponse.error) {
    throw queryError(
      "Unable to load artist source names",
      platformResponse.error.message,
    );
  }

  const platforms = new Map(
    z
      .array(platformRowSchema)
      .parse(platformResponse.data)
      .map((platform) => [platform.id, platform]),
  );
  const careersByArtist = new Map(careers.map((row) => [row.artist_id, row]));
  const latestDailyByArtist = new Map<string, z.infer<typeof dailyRowSchema>>();

  for (const row of dailyRows) {
    if (
      row.snapshot_date === latestResponse.data?.[0]?.snapshot_date &&
      !latestDailyByArtist.has(row.artist_id)
    ) {
      latestDailyByArtist.set(row.artist_id, row);
    }
  }

  return artists
    .map((artist): ArtistSummary => {
      const career = careersByArtist.get(artist.id);
      const daily = latestDailyByArtist.get(artist.id);
      const artistProfiles = profiles.filter(
        (profile) => profile.artist_id === artist.id,
      );
      const appleProfile = artistProfiles.find(
        (profile) => platforms.get(profile.platform_id)?.code === "apple_music",
      );
      const youtubeProfile = artistProfiles.find(
        (profile) => platforms.get(profile.platform_id)?.code === "youtube",
      );
      const profileLinks: ArtistProfileLink[] = artistProfiles.flatMap(
        (profile) => {
          const platform = platforms.get(profile.platform_id);
          return platform && profile.profile_url
            ? [
                {
                  platformCode: platform.code,
                  platformName: platform.name,
                  url: profile.profile_url,
                },
              ]
            : [];
        },
      );
      const artistMetrics: ArtistMetric[] = metrics
        .filter((metric) => metric.artist_id === artist.id)
        .map((metric) => ({
          platformCode: metric.platform_code,
          platformName: metric.platform_name,
          metricDate: metric.metric_date,
          name: metric.metric_name,
          value: metric.metric_value,
          unit: metric.unit,
          scope: metric.scope,
        }));
      for (const profile of artistProfiles) {
        if (profile.metadata.identitySourceUrl && profile.metadata.identitySourceName) {
          profileLinks.push({ platformCode: "identity_source", platformName: profile.metadata.identitySourceName, url: profile.metadata.identitySourceUrl });
        }
      }
      const baseStats = emptyStats();

      return {
        id: artist.id,
        name: artist.canonical_name,
        imageUrl:
          artist.image_url ??
          appleProfile?.metadata.artworkUrl ??
          youtubeProfile?.metadata.imageUrl ??
          null,
        biography: artist.biography ?? appleProfile?.metadata.biography ?? null,
        genres: appleProfile?.metadata.genres ?? [],
        currentBestRank: daily?.best_rank ?? null,
        currentChartingSongs: daily?.charting_songs ?? 0,
        stats: career
          ? {
              firstChartDate: career.first_chart_date,
              latestChartDate: career.latest_chart_date,
              chartingDays: career.charting_days,
              songsCharted: career.songs_charted,
              peakRank: career.peak_rank,
              topTenEntryDays: career.top_ten_entry_days,
              numberOneEntryDays: career.number_one_entry_days,
              totalEntryDays: career.total_entry_days,
            }
          : baseStats,
        metrics: artistMetrics,
        profiles: profileLinks,
      };
    })
    .sort(
      (left, right) =>
        (left.currentBestRank ?? Number.MAX_SAFE_INTEGER) -
          (right.currentBestRank ?? Number.MAX_SAFE_INTEGER) ||
        left.name.localeCompare(right.name),
    );
}
