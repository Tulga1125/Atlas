import type {
  AppleMusicChartResponse,
  NormalizedAppleMusicEntry,
} from "./schema";

function extractArtistId(artistUrl: string | undefined): string | null {
  if (!artistUrl) {
    return null;
  }

  const match = artistUrl.match(/\/artist\/[^/]+\/(\d+)(?:\?|$)/);
  return match?.[1] ?? null;
}

function formatArtworkUrl(template: string | undefined): string | null {
  if (!template) {
    return null;
  }

  return template.replace("{w}", "600").replace("{h}", "600");
}

export function normalizeAppleMusicChart(
  response: AppleMusicChartResponse,
): NormalizedAppleMusicEntry[] {
  const chart = response.results.songs.find(
    (candidate) => candidate.chart === "most-played",
  );
  if (!chart) throw new Error("Expected the most-played chart");

  return chart.data.map(({ id, attributes, relationships }, index) => ({
    rank: index + 1,
    itemId: id,
    title: attributes.name,
    artistName: attributes.artistName,
    artistId:
      relationships?.artists?.data[0]?.id ??
      extractArtistId(attributes.artistUrl),
    artists:
      relationships?.artists?.data.map((artist) => ({
        id: artist.id,
        name: artist.attributes?.name ?? attributes.artistName,
      })) ?? [],
    albumName: attributes.albumName ?? null,
    url: attributes.url ?? null,
    isrc: attributes.isrc ?? null,
    durationMs: attributes.durationInMillis ?? null,
    releaseDate: attributes.releaseDate ?? null,
    contentRating: attributes.contentRating ?? null,
    primaryGenre:
      attributes.genreNames?.find((genre) => genre !== "Music") ?? null,
    genreNames: [...new Set((attributes.genreNames ?? []).filter((genre) => genre !== "Music"))],
    artworkUrl: formatArtworkUrl(attributes.artwork?.url),
  }));
}
