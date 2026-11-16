import { z } from "zod";

const artworkSchema = z
  .object({
    url: z.string().min(1),
    width: z.number().optional(),
    height: z.number().optional(),
  })
  .passthrough();

const songAttributesSchema = z
  .object({
    name: z.string().min(1),
    artistName: z.string().min(1),
    albumName: z.string().optional(),
    artistUrl: z.string().optional(),
    url: z.string().optional(),
    isrc: z.string().optional(),
    durationInMillis: z.number().int().nonnegative().optional(),
    releaseDate: z.string().optional(),
    contentRating: z.string().optional(),
    genreNames: z.array(z.string()).optional(),
    artwork: artworkSchema.optional(),
  })
  .passthrough();

const songSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("songs"),
    href: z.string().optional(),
    attributes: songAttributesSchema,
    relationships: z
      .object({
        artists: z
          .object({
            data: z.array(
              z.object({
                id: z.string().min(1),
                attributes: z
                  .object({ name: z.string().min(1) })
                  .passthrough()
                  .optional(),
              }),
            ),
          })
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const songsChartSchema = z
  .object({
    chart: z.string(),
    name: z.string(),
    data: z.array(songSchema),
  })
  .passthrough();

export const appleMusicChartResponseSchema = z
  .object({
    results: z.object({
      songs: z.array(songsChartSchema).min(1),
    }),
  })
  .passthrough();

export type AppleMusicChartResponse = z.infer<
  typeof appleMusicChartResponseSchema
>;

export const normalizedAppleMusicEntrySchema = z.object({
  rank: z.number().int().positive(),
  itemId: z.string().min(1),
  title: z.string().min(1),
  artistName: z.string().min(1),
  artistId: z.string().nullable(),
  artists: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  albumName: z.string().nullable(),
  url: z.string().nullable(),
  isrc: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  releaseDate: z.string().nullable(),
  contentRating: z.string().nullable(),
  primaryGenre: z.string().nullable(),
  artworkUrl: z.string().nullable(),
});

export type NormalizedAppleMusicEntry = z.infer<
  typeof normalizedAppleMusicEntrySchema
>;
