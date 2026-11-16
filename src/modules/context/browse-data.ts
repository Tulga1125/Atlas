import "server-only";
import { createPublicDataClient } from "@/lib/supabase/public-data";
import { getOptionalChartSnapshot } from "@/modules/charts/current";
import type { Locale } from "@/modules/i18n/config";
import { termHistory, topArtists, weekChange, type ChartPoint } from "./browse";

// C3 loaders. Public client only: row-level security means only verified tags
// and active terms are visible, so nothing unverified reaches a browse page.

export const browseDimensions = { genres: "genre", themes: "theme", scenes: "scene" } as const;
export type BrowseSection = keyof typeof browseDimensions;
type Dimension = (typeof browseDimensions)[BrowseSection];

const label = (t: { label_mn: string; label_en: string }, locale: Locale) => (locale === "mn" ? t.label_mn : t.label_en);

function chunks<T>(items: T[], size = 100) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

export async function getTerms(dimension: Dimension, locale: Locale) {
  const { data, error } = await createPublicDataClient()
    .from("context_terms")
    .select("id,slug,label_mn,label_en,description_mn,description_en")
    .eq("dimension", dimension)
    .eq("status", "active")
    .order("sort_order");
  if (error) throw new Error("Vocabulary unavailable");
  return (data ?? []).map((t) => ({ id: t.id, slug: t.slug, label: label(t, locale), description: locale === "mn" ? t.description_mn : t.description_en }));
}

/** Song IDs carrying a verified term; for a scene, songs by artists with that verified scene. */
export async function taggedSongs(dimension: Dimension, slug: string) {
  const db = createPublicDataClient();
  const { data: term, error } = await db.from("context_terms").select("id,slug,label_mn,label_en").eq("dimension", dimension).eq("slug", slug).eq("status", "active").maybeSingle();
  if (error) throw new Error("Vocabulary unavailable");
  if (!term) return null;
  let artistIds: string[] = [];
  let songIds: string[] = [];
  if (dimension === "scene") {
    const tags = await db.from("artist_context_tags").select("artist_id").eq("term_id", term.id).eq("status", "verified");
    if (tags.error) throw new Error("Tags unavailable");
    artistIds = [...new Set((tags.data ?? []).map((t) => t.artist_id))];
    for (const ids of chunks(artistIds)) {
      const credits = await db.from("song_artists").select("song_id").in("artist_id", ids);
      if (credits.error) throw new Error("Credits unavailable");
      songIds.push(...(credits.data ?? []).map((c) => c.song_id));
    }
  } else {
    const tags = await db.from("song_context_tags").select("song_id").eq("term_id", term.id).eq("status", "verified").limit(10_000);
    if (tags.error) throw new Error("Tags unavailable");
    songIds = (tags.data ?? []).map((t) => t.song_id);
  }
  return { term, songIds: new Set(songIds), artistIds };
}

export async function getTermPage(section: BrowseSection, slug: string, locale: Locale) {
  const dimension = browseDimensions[section];
  const tagged = await taggedSongs(dimension, slug);
  if (!tagged) return null;
  const db = createPublicDataClient();
  const snapshot = await getOptionalChartSnapshot();
  const since = new Date(Date.parse(`${snapshot?.date ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10);
  const ids = [...tagged.songIds];
  const points: ChartPoint[] = [];
  const credits: { songId: string; artistId: string }[] = [];
  for (const batch of chunks(ids)) {
    const [facts, artists] = await Promise.all([
      db.from("chart_facts").select("snapshot_date,song_id,rank").in("song_id", batch).gte("snapshot_date", since).limit(40_000),
      db.from("song_artists").select("song_id,artist_id").in("song_id", batch),
    ]);
    if (facts.error || artists.error) throw new Error("Chart history unavailable");
    points.push(...(facts.data ?? []).flatMap((f) => (f.snapshot_date && f.song_id && f.rank ? [{ date: f.snapshot_date, songId: f.song_id, rank: f.rank }] : [])));
    credits.push(...(artists.data ?? []).map((c) => ({ songId: c.song_id, artistId: c.artist_id })));
  }
  // The history needs every chart date, not only those with tagged songs.
  const dates = await db.from("chart_snapshots").select("snapshot_date").eq("status", "approved").gte("snapshot_date", since).order("snapshot_date");
  if (dates.error) throw new Error("Archive unavailable");
  const all = [...points, ...(dates.data ?? []).map((d) => ({ date: d.snapshot_date, songId: "\u0000", rank: 101 }))];
  const history = termHistory(all, tagged.songIds);
  const top = topArtists(points, tagged.songIds, credits);
  const names = top.length ? await db.from("artists").select("id,canonical_name").in("id", top.map((t) => t.artistId)) : { data: [], error: null };
  if (names.error) throw new Error("Artists unavailable");
  const nameOf = new Map((names.data ?? []).map((a) => [a.id, a.canonical_name]));
  return {
    term: { slug: tagged.term.slug, label: label(tagged.term, locale) },
    chartDate: snapshot?.date ?? null,
    current: (snapshot?.entries ?? []).filter((e) => tagged.songIds.has(e.songId)),
    topArtists: top.map((a) => ({ ...a, name: nameOf.get(a.artistId) ?? "" })),
    history,
    weekChange: weekChange(history),
    taggedSongs: tagged.songIds.size,
  };
}

/** Current chart songs per term of a dimension, for index pages and filters. */
export async function getTermIndex(section: BrowseSection, locale: Locale) {
  const dimension = browseDimensions[section];
  const [terms, snapshot] = await Promise.all([getTerms(dimension, locale), getOptionalChartSnapshot()]);
  const onChart = new Set(snapshot?.entries.map((e) => e.songId) ?? []);
  return Promise.all(
    terms.map(async (t) => {
      const tagged = await taggedSongs(dimension, t.slug);
      return { ...t, onChart: [...(tagged?.songIds ?? [])].filter((id) => onChart.has(id)).length, tagged: tagged?.songIds.size ?? 0 };
    }),
  );
}

const paramToSection = { genre: "genres", theme: "themes", scene: "scenes" } as const;
export type TermFilter = { param: keyof typeof paramToSection; section: BrowseSection; slug: string; label: string; songIds: Set<string>; artistIds: Set<string> };

/** Reads ?genre=, ?theme= or ?scene= (first one set) into a filter of verified tags. */
export async function termFilterFrom(params: Record<string, string | string[] | undefined>, locale: Locale): Promise<TermFilter | null> {
  for (const param of ["genre", "theme", "scene"] as const) {
    const slug = params[param];
    if (typeof slug !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) continue;
    const section = paramToSection[param];
    const tagged = await taggedSongs(browseDimensions[section], slug);
    if (!tagged) return null;
    let artistIds = tagged.artistIds;
    if (param !== "scene") {
      const db = createPublicDataClient();
      artistIds = [];
      for (const batch of chunks([...tagged.songIds])) {
        const credits = await db.from("song_artists").select("artist_id").in("song_id", batch);
        if (credits.error) throw new Error("Credits unavailable");
        artistIds.push(...(credits.data ?? []).map((c) => c.artist_id));
      }
    }
    return { param, section, slug, label: label(tagged.term, locale), songIds: tagged.songIds, artistIds: new Set(artistIds) };
  }
  return null;
}

/** Per snapshot, how many tagged songs it held (for the archive filter). */
export async function taggedCountsBySnapshot(snapshotIds: string[], songIds: Set<string>) {
  const counts = new Map<string, number>();
  for (const batch of chunks(snapshotIds, 20)) {
    const { data, error } = await createPublicDataClient().from("chart_facts").select("snapshot_id,song_id").in("snapshot_id", batch).limit(5_000);
    if (error) throw new Error("Archive unavailable");
    const seen = new Set<string>();
    for (const f of data ?? []) {
      if (!f.snapshot_id || !f.song_id || !songIds.has(f.song_id) || seen.has(`${f.snapshot_id}:${f.song_id}`)) continue;
      seen.add(`${f.snapshot_id}:${f.song_id}`);
      counts.set(f.snapshot_id, (counts.get(f.snapshot_id) ?? 0) + 1);
    }
  }
  return counts;
}
