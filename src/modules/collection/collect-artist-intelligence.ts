import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getArtistCollectorEnvironment } from "@/lib/env";
import { fetchAppleMusicArtists } from "@/modules/artist-sources/apple-music";
import { fetchYouTubeChannels } from "@/modules/artist-sources/youtube";
import { getAtlasBusinessDate } from "./business-date";

const PLATFORM_IDS = {
  apple_music: "00000000-0000-0000-0000-000000000001",
  youtube: "00000000-0000-0000-0000-000000000002",
} as const;

type AdminClient = ReturnType<typeof createAdminClient>;

type SourceResult = {
  source: keyof typeof PLATFORM_IDS;
  runId: string;
  artistCount: number;
  profilesUpdated: number;
  metricsWritten: number;
  reused: boolean;
};

export type ArtistIntelligenceResult = {
  metricDate: string;
  sources: SourceResult[];
  skipped: Array<keyof typeof PLATFORM_IDS>;
};

type RunRow = {
  id: string;
  status: string;
  attempt_number: number;
  artists_requested: number;
  profiles_updated: number;
  metrics_written: number;
};

async function beginRun(
  supabase: AdminClient,
  source: keyof typeof PLATFORM_IDS,
  metricDate: string,
  now: Date,
) {
  const idempotencyKey = `artist:${source}:${metricDate}`;
  const { data: existing, error: existingError } = await supabase
    .from("artist_intelligence_runs")
    .select(
      "id,status,attempt_number,artists_requested,profiles_updated,metrics_written",
    )
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle<RunRow>();

  if (existingError) {
    throw new Error(
      `Unable to inspect ${source} artist run: ${existingError.message}`,
    );
  }

  if (existing?.status === "succeeded") {
    return { run: existing, reused: true };
  }

  if (existing) {
    const { data, error } = await supabase
      .from("artist_intelligence_runs")
      .update({
        status: "running",
        attempt_number: existing.attempt_number + 1,
        scheduled_for: now.toISOString(),
        started_at: now.toISOString(),
        completed_at: null,
        error_message: null,
      })
      .eq("id", existing.id)
      .select(
        "id,status,attempt_number,artists_requested,profiles_updated,metrics_written",
      )
      .single<RunRow>();

    if (error) {
      throw new Error(`Unable to retry ${source} artist run: ${error.message}`);
    }

    return { run: data, reused: false };
  }

  const { data, error } = await supabase
    .from("artist_intelligence_runs")
    .insert({
      source_platform_id: PLATFORM_IDS[source],
      idempotency_key: idempotencyKey,
      scheduled_for: now.toISOString(),
      started_at: now.toISOString(),
      status: "running",
    })
    .select(
      "id,status,attempt_number,artists_requested,profiles_updated,metrics_written",
    )
    .single<RunRow>();

  if (error) {
    throw new Error(`Unable to create ${source} artist run: ${error.message}`);
  }

  return { run: data, reused: false };
}

async function finishRun(
  supabase: AdminClient,
  runId: string,
  counts: {
    artistsRequested: number;
    profilesUpdated: number;
    metricsWritten: number;
  },
) {
  const { error } = await supabase
    .from("artist_intelligence_runs")
    .update({
      status: "succeeded",
      completed_at: new Date().toISOString(),
      artists_requested: counts.artistsRequested,
      profiles_updated: counts.profilesUpdated,
      metrics_written: counts.metricsWritten,
      error_message: null,
    })
    .eq("id", runId);

  if (error) {
    throw new Error(`Unable to complete artist run: ${error.message}`);
  }
}

async function failRun(supabase: AdminClient, runId: string, error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown artist collection failure";

  await supabase
    .from("artist_intelligence_runs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: message.slice(0, 2_000),
    })
    .eq("id", runId);
}

async function retainSourcePayload(
  supabase: AdminClient,
  input: {
    runId: string;
    sourceUrl: string;
    checksum: string;
    payload: unknown;
  },
) {
  const { data: existing, error: lookupError } = await supabase
    .from("artist_source_payloads")
    .select("id")
    .eq("run_id", input.runId)
    .eq("checksum", input.checksum)
    .maybeSingle<{ id: string }>();

  if (lookupError) {
    throw new Error(
      `Unable to inspect artist source evidence: ${lookupError.message}`,
    );
  }
  if (existing) {
    return existing.id;
  }

  const { data, error } = await supabase
    .from("artist_source_payloads")
    .insert({
      run_id: input.runId,
      source_url: input.sourceUrl,
      checksum: input.checksum,
      payload: z.json().parse(input.payload),
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw new Error(
      `Unable to retain artist source evidence: ${error.message}`,
    );
  }

  return data.id;
}

async function collectAppleArtists(
  supabase: AdminClient,
  developerToken: string,
  metricDate: string,
  now: Date,
): Promise<SourceResult> {
  const { run, reused } = await beginRun(
    supabase,
    "apple_music",
    metricDate,
    now,
  );

  if (reused) {
    return {
      source: "apple_music",
      runId: run.id,
      artistCount: run.artists_requested,
      profilesUpdated: run.profiles_updated,
      metricsWritten: run.metrics_written,
      reused: true,
    };
  }

  try {
    const { data, error } = await supabase
      .from("artists")
      .select("id,source_key")
      .like("source_key", "apple_music:%")
      .limit(1_000);

    if (error) {
      throw new Error(`Unable to load Apple Music artists: ${error.message}`);
    }

    const candidates = (data ?? []).flatMap((artist) => {
      const sourceKey =
        typeof artist.source_key === "string" ? artist.source_key : "";
      const artistId = sourceKey.slice("apple_music:".length);

      return artistId && !artistId.startsWith("name:")
        ? [{ artistId: artist.id as string, platformArtistId: artistId }]
        : [];
    });

    if (candidates.length === 0) {
      await finishRun(supabase, run.id, {
        artistsRequested: 0,
        profilesUpdated: 0,
        metricsWritten: 0,
      });

      return {
        source: "apple_music",
        runId: run.id,
        artistCount: 0,
        profilesUpdated: 0,
        metricsWritten: 0,
        reused: false,
      };
    }

    const baseProfiles = candidates.map((candidate) => ({
      artist_id: candidate.artistId,
      platform_id: PLATFORM_IDS.apple_music,
      platform_artist_id: candidate.platformArtistId,
      is_primary: true,
      match_status: "verified" as const,
      match_method: "source",
      confidence: 1,
    }));
    const { data: profileRows, error: profileError } = await supabase
      .from("artist_platform_profiles")
      .upsert(baseProfiles, {
        onConflict: "platform_id,platform_artist_id",
      })
      .select("id,artist_id,platform_artist_id,metadata");

    if (profileError) {
      throw new Error(
        `Unable to register Apple Music profiles: ${profileError.message}`,
      );
    }

    const profilesByPlatformId = new Map(
      (profileRows ?? []).map((profile) => [
        profile.platform_artist_id as string,
        profile,
      ]),
    );
    const batches = await fetchAppleMusicArtists(
      developerToken,
      candidates.map((candidate) => candidate.platformArtistId),
    );
    const enrichedRows: Database["public"]["Tables"]["artist_platform_profiles"]["Insert"][] =
      [];

    for (const batch of batches) {
      await retainSourcePayload(supabase, {
        runId: run.id,
        sourceUrl: batch.sourceUrl,
        checksum: batch.checksum,
        payload: batch.payload,
      });

      for (const artist of batch.profiles) {
        const profile = profilesByPlatformId.get(artist.artistId);
        if (!profile) {
          continue;
        }

        enrichedRows.push({
          id: profile.id,
          artist_id: profile.artist_id,
          platform_id: PLATFORM_IDS.apple_music,
          platform_artist_id: artist.artistId,
          profile_url: artist.profileUrl,
          is_primary: true,
          match_status: "verified" as const,
          match_method: "source",
          confidence: 1,
          metadata: {
            ...(typeof profile.metadata === "object" && profile.metadata
              ? profile.metadata
              : {}),
            sourceName: artist.name,
            artworkUrl: artist.artworkUrl,
            biography: artist.biography,
            genres: artist.genres,
          },
          last_enriched_at: now.toISOString(),
          updated_at: now.toISOString(),
        });
      }
    }

    if (enrichedRows.length > 0) {
      const { error: enrichmentError } = await supabase
        .from("artist_platform_profiles")
        .upsert(enrichedRows, { onConflict: "id" });

      if (enrichmentError) {
        throw new Error(
          `Unable to enrich Apple Music profiles: ${enrichmentError.message}`,
        );
      }
    }

    await finishRun(supabase, run.id, {
      artistsRequested: candidates.length,
      profilesUpdated: enrichedRows.length,
      metricsWritten: 0,
    });

    return {
      source: "apple_music",
      runId: run.id,
      artistCount: candidates.length,
      profilesUpdated: enrichedRows.length,
      metricsWritten: 0,
      reused: false,
    };
  } catch (error) {
    await failRun(supabase, run.id, error);
    throw error;
  }
}

async function collectYouTubeArtists(
  supabase: AdminClient,
  apiKey: string,
  metricDate: string,
  now: Date,
): Promise<SourceResult> {
  const { run, reused } = await beginRun(supabase, "youtube", metricDate, now);

  if (reused) {
    return {
      source: "youtube",
      runId: run.id,
      artistCount: run.artists_requested,
      profilesUpdated: run.profiles_updated,
      metricsWritten: run.metrics_written,
      reused: true,
    };
  }

  try {
    const { data, error } = await supabase
      .from("artist_platform_profiles")
      .select(
        "id,artist_id,platform_artist_id,metadata,is_primary,match_method,confidence",
      )
      .eq("platform_id", PLATFORM_IDS.youtube)
      .eq("match_status", "verified")
      .eq("is_primary", true)
      .limit(1_000);

    if (error) {
      throw new Error(
        `Unable to load verified YouTube profiles: ${error.message}`,
      );
    }

    const profiles = data ?? [];
    if (profiles.length === 0) {
      await finishRun(supabase, run.id, {
        artistsRequested: 0,
        profilesUpdated: 0,
        metricsWritten: 0,
      });

      return {
        source: "youtube",
        runId: run.id,
        artistCount: 0,
        profilesUpdated: 0,
        metricsWritten: 0,
        reused: false,
      };
    }

    const profilesByChannelId = new Map(
      profiles.map((profile) => [
        profile.platform_artist_id as string,
        profile,
      ]),
    );
    const batches = await fetchYouTubeChannels(apiKey, [
      ...profilesByChannelId.keys(),
    ]);
    let metricsWritten = 0;
    let profilesUpdated = 0;

    for (const batch of batches) {
      const payloadId = await retainSourcePayload(supabase, {
        runId: run.id,
        sourceUrl: batch.sourceUrl,
        checksum: batch.checksum,
        payload: batch.payload,
      });

      const profileUpdates: Database["public"]["Tables"]["artist_platform_profiles"]["Insert"][] =
        [];
      const metricRows: Database["public"]["Tables"]["artist_metric_snapshots"]["Insert"][] =
        [];

      for (const channel of batch.channels) {
        const profile = profilesByChannelId.get(channel.channelId);
        if (!profile) {
          continue;
        }

        profileUpdates.push({
          id: profile.id,
          artist_id: profile.artist_id,
          platform_id: PLATFORM_IDS.youtube,
          platform_artist_id: channel.channelId,
          profile_url: channel.profileUrl,
          is_primary: profile.is_primary,
          match_status: "verified" as const,
          match_method: profile.match_method,
          confidence: profile.confidence,
          metadata: {
            ...(typeof profile.metadata === "object" && profile.metadata
              ? profile.metadata
              : {}),
            sourceName: channel.title,
            description: channel.description,
            customUrl: channel.customUrl,
            imageUrl: channel.imageUrl,
            publishedAt: channel.publishedAt,
          },
          last_enriched_at: now.toISOString(),
          updated_at: now.toISOString(),
        });

        for (const metric of channel.metrics) {
          metricRows.push({
            artist_id: profile.artist_id,
            platform_id: PLATFORM_IDS.youtube,
            profile_id: profile.id,
            raw_payload_id: payloadId,
            metric_date: metricDate,
            collected_at: now.toISOString(),
            metric_name: metric.name,
            metric_value: z.coerce
              .number()
              .int()
              .nonnegative()
              .parse(metric.value),
            unit: metric.unit,
            scope: "global",
            methodology_version: "youtube-channel-statistics-v1",
          });
        }
      }

      if (profileUpdates.length > 0) {
        const { error: profileError } = await supabase
          .from("artist_platform_profiles")
          .upsert(profileUpdates, { onConflict: "id" });

        if (profileError) {
          throw new Error(
            `Unable to update YouTube profiles: ${profileError.message}`,
          );
        }
        profilesUpdated += profileUpdates.length;
      }

      if (metricRows.length > 0) {
        const { data: insertedMetrics, error: metricError } = await supabase
          .from("artist_metric_snapshots")
          .upsert(metricRows, {
            onConflict: "artist_id,platform_id,metric_date,metric_name,scope",
            ignoreDuplicates: true,
          })
          .select("id");

        if (metricError) {
          throw new Error(
            `Unable to store YouTube metrics: ${metricError.message}`,
          );
        }
        metricsWritten += insertedMetrics?.length ?? 0;
      }
    }

    await finishRun(supabase, run.id, {
      artistsRequested: profiles.length,
      profilesUpdated,
      metricsWritten,
    });

    return {
      source: "youtube",
      runId: run.id,
      artistCount: profiles.length,
      profilesUpdated,
      metricsWritten,
      reused: false,
    };
  } catch (error) {
    await failRun(supabase, run.id, error);
    throw error;
  }
}

export async function collectArtistIntelligence(
  now = new Date(),
): Promise<ArtistIntelligenceResult> {
  const environment = getArtistCollectorEnvironment();
  const supabase = createAdminClient();
  const metricDate = getAtlasBusinessDate(now);
  const sources: SourceResult[] = [];
  const skipped: Array<keyof typeof PLATFORM_IDS> = [];

  if (environment.APPLE_MUSIC_DEVELOPER_TOKEN) {
    sources.push(
      await collectAppleArtists(
        supabase,
        environment.APPLE_MUSIC_DEVELOPER_TOKEN,
        metricDate,
        now,
      ),
    );
  } else {
    skipped.push("apple_music");
  }

  if (environment.YOUTUBE_API_KEY) {
    sources.push(
      await collectYouTubeArtists(
        supabase,
        environment.YOUTUBE_API_KEY,
        metricDate,
        now,
      ),
    );
  } else {
    skipped.push("youtube");
  }

  if (sources.length === 0) {
    throw new Error(
      "Artist sources are not configured. Add APPLE_MUSIC_DEVELOPER_TOKEN or YOUTUBE_API_KEY.",
    );
  }

  return { metricDate, sources, skipped };
}
