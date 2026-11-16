import { z } from "zod";
import { setTimeout as sleep } from "node:timers/promises";

export const artistSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(200),
  country: z.string().length(2).nullable().optional(),
  type: z.string().nullable().optional(),
  "sort-name": z.string().optional(),
  aliases: z.array(z.object({ name: z.string().min(1).max(200), locale: z.string().nullable().optional() }).passthrough()).optional(),
}).passthrough();

export const discoverySchema = z.object({
  source: z.literal("musicbrainz"),
  query: z.literal("country:MN"),
  fetchedAt: z.iso.datetime(),
  count: z.number().int().positive().max(10000),
  artists: z.array(artistSchema).min(1).max(10000),
  additionalArtistIds: z.array(z.uuid()).default([]),
}).superRefine((value, ctx) => {
  if (value.artists.some(a => a.country !== "MN" && !value.additionalArtistIds.includes(a.id)))
    ctx.addIssue({ code: "custom", message: "Non-MN discovery records require an explicit curated lookup" });
  if (value.count !== value.artists.length || new Set(value.artists.map(a => a.id)).size !== value.count)
    ctx.addIssue({ code: "custom", message: "Incomplete or duplicate MusicBrainz search results; fetch again before importing." });
});

const httpUrl = z.url().refine(value => ["http:", "https:"].includes(new URL(value).protocol));
export const curatedSchema = z.array(z.object({
  mbid: z.uuid(),
  name: z.string().trim().min(1).max(200),
  biography: z.string().trim().min(1).max(1000),
  sourceUrl: httpUrl,
  sourceName: z.string().min(1).max(100),
  evidenceType: z.enum(["official_profile", "label", "press"]),
  notes: z.string().trim().min(1).max(1000),
  checkedAt: z.iso.date(),
})).max(100).refine(rows => new Set(rows.map(a => a.mbid)).size === rows.length, "Duplicate curated artist");

export function validateImport(discovery, curated = []) {
  const payload = discoverySchema.parse(discovery);
  const reviewed = curatedSchema.parse(curated);
  for (const id of payload.additionalArtistIds)
    if (!reviewed.some(a => a.mbid === id)) throw new Error("Additional MusicBrainz lookups require the matching curated manifest");
  for (const artist of reviewed)
    if (!payload.artists.some(a => a.id === artist.mbid))
      throw new Error(`Curated artist ${artist.name} is missing from the discovery batch`);
  return { payload, curated: reviewed };
}

export async function discoverArtists({ fetcher = fetch, wait = sleep, curated = [] } = {}) {
  const reviewed = curatedSchema.parse(curated);
  async function request(url) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await wait(attempt ? 2000 * 2 ** attempt : 1100);
      const response = await fetcher(url, {
        headers: { "User-Agent": "AtlasCharts/0.1 (https://github.com/anand-ts/atlas-billboard)", Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      });
      if ([429, 502, 503, 504].includes(response.status) && attempt < 3) continue;
      if (!response.ok) throw new Error(`MusicBrainz returned HTTP ${response.status}`);
      return response.json();
    }
    throw new Error("MusicBrainz retry limit exceeded");
  }
  // Equal scores make offset pagination unstable. Partition by disjoint MBID
  // prefixes instead, recursively, until each search fits in one response.
  async function collect(prefixes = [], depth = 0) {
    if (depth > 8) throw new Error("MusicBrainz partition limit exceeded");
    const query = "country:MN" + (prefixes.length ? ` AND arid:(${prefixes.map(p => p + "*").join(" OR ")})` : "");
    const url = new URL("https://musicbrainz.org/ws/2/artist/");
    url.search = new URLSearchParams({ query, fmt: "json", limit: "100" }).toString();
    const page = z.object({ count: z.number().int().nonnegative().max(10000), artists: z.array(artistSchema) }).parse(await request(url));
    if (page.count <= 100) {
      if (page.artists.length !== page.count) throw new Error("Incomplete MusicBrainz partition");
      return page.artists;
    }
    const hex = [..."0123456789abcdef"];
    const next = (prefixes.length ? prefixes : [""]).flatMap(p => hex.map(h => p + h));
    const artists = [];
    const size = next.length / 4;
    for (let i = 0; i < next.length; i += size) artists.push(...await collect(next.slice(i, i + size), depth + 1));
    if (artists.length !== page.count || new Set(artists.map(a => a.id)).size !== page.count)
      throw new Error("MusicBrainz results changed during discovery; fetch again before importing.");
    return artists;
  }
  const artists = await collect();
  const additionalArtistIds = [];
  for (const artist of reviewed) {
    if (artists.some(a => a.id === artist.mbid)) continue;
    const url = new URL(`https://musicbrainz.org/ws/2/artist/${artist.mbid}`);
    url.search = new URLSearchParams({ fmt: "json", inc: "aliases" }).toString();
    const source = artistSchema.parse(await request(url));
    if (source.id !== artist.mbid) throw new Error(`MusicBrainz redirected ${artist.mbid}; review the curated identity again.`);
    artists.push(source);
    additionalArtistIds.push(source.id);
  }
  return discoverySchema.parse({ source: "musicbrainz", query: "country:MN", fetchedAt: new Date().toISOString(), count: artists.length, artists, additionalArtistIds });
}
