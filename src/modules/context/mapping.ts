// Source genres (Apple Music, MusicBrainz) map to Atlas genre terms only
// through reviewed mappings. Mirrors public.suggest_tags_from_source_genres.

export type GenreMapping = {
  source: "apple_music" | "musicbrainz";
  sourceValue: string;
  termId: string | null;
  status: "suggested" | "verified" | "unverified" | "disputed";
};

/** Atlas genre terms suggested by a song's source genres; unreviewed or rejected mappings give nothing. */
export function mapSourceGenres(
  values: { source: GenreMapping["source"]; value: string }[],
  mappings: GenreMapping[],
) {
  const index = new Map(mappings.map((m) => [`${m.source}\u0000${m.sourceValue}`, m]));
  const result = new Map<string, string>();
  for (const { source, value } of values) {
    if (value === "Music") continue;
    const mapping = index.get(`${source}\u0000${value}`);
    if (mapping?.status !== "verified" || !mapping.termId) continue;
    if (!result.has(mapping.termId)) result.set(mapping.termId, `${source === "apple_music" ? "Apple Music" : "MusicBrainz"} genre: ${value}`);
  }
  return [...result].map(([termId, evidence]) => ({ termId, evidence })).sort((a, b) => a.termId.localeCompare(b.termId));
}

/** Apple genre names that still need a mapping decision, most common first. */
export function unmappedGenres(values: string[], mappings: GenreMapping[]) {
  const known = new Set(mappings.filter((m) => m.source === "apple_music" && m.status !== "suggested").map((m) => m.sourceValue));
  const counts = new Map<string, number>();
  for (const v of values) if (v !== "Music" && !known.has(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value, songs]) => ({ value, songs }));
}
