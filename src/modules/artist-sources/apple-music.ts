import { createHash } from "node:crypto";
import { z } from "zod";

const appleArtworkSchema = z
  .object({
    url: z.string().min(1),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  })
  .passthrough();

const editorialNotesSchema = z
  .object({
    short: z.string().optional(),
    standard: z.string().optional(),
  })
  .passthrough();

const appleArtistSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("artists"),
    attributes: z
      .object({
        name: z.string().min(1),
        url: z.string().optional(),
        genreNames: z.array(z.string()).optional(),
        artwork: appleArtworkSchema.optional(),
        editorialNotes: editorialNotesSchema.optional(),
      })
      .passthrough(),
  })
  .passthrough();

export const appleArtistsResponseSchema = z
  .object({
    data: z.array(appleArtistSchema),
  })
  .passthrough();

export type AppleArtistProfile = {
  artistId: string;
  name: string;
  profileUrl: string | null;
  artworkUrl: string | null;
  biography: string | null;
  genres: string[];
};

export type AppleArtistBatch = {
  sourceUrl: string;
  checksum: string;
  payload: unknown;
  profiles: AppleArtistProfile[];
};

const APPLE_MUSIC_ARTISTS_URL =
  "https://api.music.apple.com/v1/catalog/mn/artists";

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from(
    { length: Math.ceil(items.length / size) },
    (_, index) => items.slice(index * size, (index + 1) * size),
  );
}

function artworkUrl(url: string | undefined): string | null {
  if (!url) {
    return null;
  }

  return url
    .replace("{w}", "800")
    .replace("{h}", "800")
    .replace("{f}", "jpg");
}

export function normalizeAppleArtist(
  artist: z.infer<typeof appleArtistSchema>,
): AppleArtistProfile {
  return {
    artistId: artist.id,
    name: artist.attributes.name,
    profileUrl: artist.attributes.url ?? null,
    artworkUrl: artworkUrl(artist.attributes.artwork?.url),
    biography:
      artist.attributes.editorialNotes?.standard ??
      artist.attributes.editorialNotes?.short ??
      null,
    genres: artist.attributes.genreNames ?? [],
  };
}

export async function fetchAppleMusicArtists(
  developerToken: string,
  artistIds: string[],
): Promise<AppleArtistBatch[]> {
  const uniqueArtistIds = [...new Set(artistIds)];
  const batches: AppleArtistBatch[] = [];

  for (const ids of chunk(uniqueArtistIds, 25)) {
    const url = new URL(APPLE_MUSIC_ARTISTS_URL);
    url.searchParams.set("ids", ids.join(","));

    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${developerToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Apple Music artists returned ${response.status}: ${detail.slice(0, 300)}`,
      );
    }

    const payload: unknown = await response.json();
    const parsed = appleArtistsResponseSchema.parse(payload);
    const serializedPayload = JSON.stringify(payload);

    batches.push({
      sourceUrl: url.toString(),
      checksum: createHash("sha256").update(serializedPayload).digest("hex"),
      payload,
      profiles: parsed.data.map(normalizeAppleArtist),
    });
  }

  return batches;
}
