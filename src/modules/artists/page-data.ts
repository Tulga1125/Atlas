import "server-only";
import { createPublicDataClient } from "@/lib/supabase/public-data";
import { getSongHistory } from "@/modules/charts/history";
import type { Locale } from "@/modules/i18n/config";
import { getArtistById } from "./current";
import {
  collaborations,
  milestones,
  profileBars,
  similarArtists,
  relatedSongs,
  type ArtistProfile,
} from "./page-model";

// Everything the public artist page shows. Uses the public client only, so
// row-level security guarantees that no unverified tag can appear.

export type TagLabel = { termId: string; dimension: string; slug: string; label: string };

export async function getArtistPage(artistId: string, locale: Locale) {
  const artist = await getArtistById(artistId);
  if (!artist) return null;
  const db = createPublicDataClient();
  const label = (t: { label_mn: string; label_en: string }) => (locale === "mn" ? t.label_mn : t.label_en);

  const { data: credits, error: creditError } = await db.from("song_artists").select("song_id,artist_id,credit_role").eq("artist_id", artistId);
  if (creditError) throw new Error("Artist discography unavailable");
  const songIds = [...new Set((credits ?? []).map((c) => c.song_id))];
  const [histories, allCredits, songTags, scene, profiles, terms, publications] = await Promise.all([
    Promise.all(songIds.map((id) => getSongHistory(id))),
    songIds.length ? db.from("song_artists").select("song_id,artist_id").in("song_id", songIds) : Promise.resolve({ data: [], error: null }),
    songIds.length
      ? db.from("song_context_tags").select("song_id,term_id").in("song_id", songIds).eq("status", "verified")
      : Promise.resolve({ data: [], error: null }),
    db.from("artist_context_tags").select("term_id,evidence_url").eq("artist_id", artistId).eq("status", "verified"),
    db.from("latest_artist_context_profiles").select("artist_id,dimension,term_id,share,songs,tagged_songs,total_songs"),
    db.from("context_terms").select("id,dimension,slug,label_mn,label_en"),
    db.rpc("subject_publications", { p_artist: artistId }),
  ]);
  for (const r of [allCredits, songTags, scene, profiles, terms, publications])
    if (r.error) throw new Error("Artist context unavailable");

  const termById = new Map((terms.data ?? []).map((t) => [t.id, { termId: t.id, dimension: t.dimension, slug: t.slug, label: label(t) }]));
  const songs = histories
    .filter((s): s is NonNullable<typeof s> => s !== null && !s.redirectTo)
    .map((s) => ({
      id: s.id,
      title: s.title,
      currentRank: s.currentRank,
      peakRank: s.peakRank,
      daysOnChart: s.daysOnChart,
      history: s.history,
      links: s.assets.filter((a) => a.platform_url).map((a) => ({ id: a.id, url: a.platform_url as string })),
      tags: (songTags.data ?? [])
        .filter((t) => t.song_id === s.id)
        .map((t) => termById.get(t.term_id))
        .filter((t): t is TagLabel => !!t)
        .sort((a, b) => a.dimension.localeCompare(b.dimension) || a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => (a.currentRank ?? 101) - (b.currentRank ?? 101) || (a.peakRank ?? 101) - (b.peakRank ?? 101) || b.daysOnChart - a.daysOnChart || a.title.localeCompare(b.title));

  const rows = (profiles.data ?? []).filter((r) => r.artist_id === artistId).map((r) => ({
    dimension: r.dimension ?? "",
    termId: r.term_id ?? "",
    share: Number(r.share ?? 0),
    songs: r.songs ?? 0,
    taggedSongs: r.tagged_songs ?? 0,
    totalSongs: r.total_songs ?? 0,
  }));
  const termList = [...termById.values()].map((t) => ({ id: t.termId, slug: t.slug, label: t.label }));
  const taggedIn = (d: string) => songs.filter((s) => s.tags.some((t) => t.dimension === d)).length;
  const profile = (["genre", "theme", "mood"] as const).map((d) => {
    const bars = profileBars(rows, termList, d);
    // Always show N of M from the live tags, even before a profile run.
    return { dimension: d, ...bars, tagged: taggedIn(d), total: songs.length };
  });

  const byArtist = new Map<string, ArtistProfile>();
  for (const r of profiles.data ?? []) {
    if (!r.artist_id || !r.dimension || !r.term_id) continue;
    if (!byArtist.has(r.artist_id)) byArtist.set(r.artist_id, { artistId: r.artist_id, rows: [] });
    byArtist.get(r.artist_id)!.rows.push({ dimension: r.dimension, termId: r.term_id, share: Number(r.share ?? 0) });
  }
  const similar = byArtist.has(artistId) ? similarArtists(byArtist.get(artistId)!, [...byArtist.values()]) : [];
  const collabs = collaborations(
    artistId,
    (allCredits.data ?? []).map((c) => ({ songId: c.song_id, artistId: c.artist_id })),
    new Map(songs.map((s) => [s.id, s.title])),
  );
  const nameIds = [...new Set([...similar.map((s) => s.artistId), ...collabs.map((c) => c.artistId)])];
  const names = nameIds.length ? await db.from("artists").select("id,canonical_name").in("id", nameIds) : { data: [], error: null };
  if (names.error) throw new Error("Artist names unavailable");
  const nameOf = new Map((names.data ?? []).map((a) => [a.id, a.canonical_name]));
  const onChart = songs.filter((s) => s.currentRank !== null);

  return {
    artist,
    scene: (scene.data ?? []).map((t) => termById.get(t.term_id)).filter((t): t is TagLabel => !!t),
    stats: {
      ...artist.stats,
      currentSongs: onChart.length,
      chartShare: onChart.length, // of 100 positions on the current chart
    },
    songs,
    milestones: milestones(songs.map((s) => ({ songId: s.id, title: s.title, history: s.history }))),
    profile,
    collaborations: collabs.map((c) => ({ ...c, name: nameOf.get(c.artistId) ?? "" })),
    similar: similar.map((s) => ({
      ...s,
      name: nameOf.get(s.artistId) ?? "",
      sharedLabels: s.shared.map((id) => termById.get(id)?.label ?? id),
    })),
    publications: publications.data ?? [],
    filters: {
      genres: [...new Map(songs.flatMap((s) => s.tags.filter((t) => t.dimension === "genre")).map((t) => [t.slug, t])).values()],
      themes: [...new Map(songs.flatMap((s) => s.tags.filter((t) => t.dimension === "theme")).map((t) => [t.slug, t])).values()],
    },
  };
}

export type ArtistPageData = NonNullable<Awaited<ReturnType<typeof getArtistPage>>>;

/** Context panels for a public song page: verified tags, artist scene, related songs, coverage. */
export async function getSongContext(songId: string, locale: Locale) {
  const db = createPublicDataClient();
  const label = (t: { label_mn: string; label_en: string }) => (locale === "mn" ? t.label_mn : t.label_en);
  const [tags, credits, terms, publications] = await Promise.all([
    db.from("song_context_tags").select("song_id,term_id").eq("status", "verified").limit(20_000),
    db.from("song_artists").select("artist_id,artists(canonical_name)").eq("song_id", songId),
    db.from("context_terms").select("id,dimension,slug,label_mn,label_en"),
    db.rpc("subject_publications", { p_song: songId }),
  ]);
  for (const r of [tags, credits, terms, publications]) if (r.error) throw new Error("Song context unavailable");
  const termById = new Map((terms.data ?? []).map((t) => [t.id, { termId: t.id, dimension: t.dimension, slug: t.slug, label: label(t) }]));
  const artistIds = (credits.data ?? []).map((c) => c.artist_id);
  const scenes = artistIds.length
    ? await db.from("artist_context_tags").select("artist_id,term_id").in("artist_id", artistIds).eq("status", "verified")
    : { data: [], error: null };
  if (scenes.error) throw new Error("Scene unavailable");
  const own = (tags.data ?? []).filter((t) => t.song_id === songId).map((t) => termById.get(t.term_id)).filter((t): t is TagLabel => !!t);
  const themeTags = (tags.data ?? [])
    .filter((t) => termById.get(t.term_id)?.dimension === "theme")
    .map((t) => ({ songId: t.song_id, termId: t.term_id }));
  const related = relatedSongs(songId, themeTags, new Map());
  const relatedTitles = related.length
    ? await db.from("songs").select("id,canonical_title").in("id", related.map((r) => r.songId)).is("redirect_to", null)
    : { data: [], error: null };
  if (relatedTitles.error) throw new Error("Related songs unavailable");
  const titleOf = new Map((relatedTitles.data ?? []).map((s) => [s.id, s.canonical_title]));
  return {
    tags: own,
    scenes: (credits.data ?? []).map((c) => ({
      artistId: c.artist_id,
      artist: c.artists?.canonical_name ?? "",
      scenes: (scenes.data ?? []).filter((s) => s.artist_id === c.artist_id).map((s) => termById.get(s.term_id)?.label ?? ""),
    })),
    related: related.filter((r) => titleOf.has(r.songId)).map((r) => ({ ...r, title: titleOf.get(r.songId)! })),
    publications: publications.data ?? [],
  };
}
