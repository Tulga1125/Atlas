// Artist and song page model (C2). Pure, deterministic, from stored facts.

export type SongHistory = { songId: string; title: string; history: { date: string; rank: number }[] };

export type Milestone = {
  date: string;
  kind: "first_entry" | "first_top_ten" | "number_one" | "career_peak";
  songId: string;
  title: string;
  rank: number;
};

/**
 * Milestones from approved chart history (not from unreviewed signals):
 * the artist's first chart entry, first Top 10, each song's first No. 1, and
 * the first day the artist reached its best-ever rank (if that is not No. 1).
 */
export function milestones(songs: SongHistory[]): Milestone[] {
  const points = songs
    .flatMap((s) => s.history.map((h) => ({ ...h, songId: s.songId, title: s.title })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.rank - b.rank || a.songId.localeCompare(b.songId));
  if (points.length === 0) return [];
  const out: Milestone[] = [];
  const add = (kind: Milestone["kind"], p: (typeof points)[number]) =>
    out.push({ date: p.date, kind, songId: p.songId, title: p.title, rank: p.rank });
  add("first_entry", points[0]);
  const topTen = points.find((p) => p.rank <= 10);
  if (topTen) add("first_top_ten", topTen);
  const seenNumberOne = new Set<string>();
  for (const p of points)
    if (p.rank === 1 && !seenNumberOne.has(p.songId)) {
      seenNumberOne.add(p.songId);
      add("number_one", p);
    }
  const best = Math.min(...points.map((p) => p.rank));
  if (best > 1) add("career_peak", points.find((p) => p.rank === best)!);
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

export type ProfileRow = { dimension: string; termId: string; share: number; songs: number; taggedSongs: number; totalSongs: number };
export type Term = { id: string; slug: string; label: string };
export type ProfileBar = { termId: string; slug: string; label: string; percent: number; songs: number };

/** Bars per dimension, largest first, with "based on N tagged songs of M". */
export function profileBars(rows: ProfileRow[], terms: Term[], dimension: string) {
  const byId = new Map(terms.map((t) => [t.id, t]));
  const own = rows.filter((r) => r.dimension === dimension && byId.has(r.termId));
  return {
    bars: own
      .map((r) => ({
        termId: r.termId,
        slug: byId.get(r.termId)!.slug,
        label: byId.get(r.termId)!.label,
        percent: Math.round(r.share * 100),
        songs: r.songs,
      }))
      .sort((a, b) => b.percent - a.percent || a.slug.localeCompare(b.slug)),
    tagged: own[0]?.taggedSongs ?? 0,
    total: own[0]?.totalSongs ?? rows[0]?.totalSongs ?? 0,
  };
}

export type ArtistProfile = { artistId: string; rows: { dimension: string; termId: string; share: number }[] };
export type SimilarArtist = { artistId: string; score: number; shared: string[] };

/**
 * Explainable similarity: the overlap of genre and theme shares,
 * sum over shared terms of min(shareA, shareB), averaged over the two
 * dimensions. Returns the shared terms as the reason. No black box.
 */
export function similarArtists(target: ArtistProfile, others: ArtistProfile[], limit = 5, minScore = 0.3): SimilarArtist[] {
  const vector = (p: ArtistProfile, d: string) =>
    new Map(p.rows.filter((r) => r.dimension === d).map((r) => [r.termId, r.share]));
  const dims = ["genre", "theme"];
  return others
    .filter((o) => o.artistId !== target.artistId)
    .map((o) => {
      let score = 0;
      const shared: { termId: string; weight: number }[] = [];
      for (const d of dims) {
        const a = vector(target, d), b = vector(o, d);
        for (const [term, share] of a)
          if (b.has(term)) {
            const w = Math.min(share, b.get(term)!);
            score += w / dims.length;
            shared.push({ termId: term, weight: w });
          }
      }
      return {
        artistId: o.artistId,
        score: Math.round(score * 1000) / 1000,
        shared: shared.sort((x, y) => y.weight - x.weight || x.termId.localeCompare(y.termId)).slice(0, 3).map((s) => s.termId),
      };
    })
    .filter((s) => s.score >= minScore && s.shared.length > 0)
    .sort((a, b) => b.score - a.score || a.artistId.localeCompare(b.artistId))
    .slice(0, limit);
}

/** Co-credited artists and the songs they share with this artist. */
export function collaborations(artistId: string, credits: { songId: string; artistId: string }[], titles: Map<string, string>) {
  const mySongs = new Set(credits.filter((c) => c.artistId === artistId).map((c) => c.songId));
  const byArtist = new Map<string, Set<string>>();
  for (const c of credits)
    if (c.artistId !== artistId && mySongs.has(c.songId)) {
      if (!byArtist.has(c.artistId)) byArtist.set(c.artistId, new Set());
      byArtist.get(c.artistId)!.add(c.songId);
    }
  return [...byArtist]
    .map(([id, songs]) => ({ artistId: id, songs: [...songs].map((s) => titles.get(s) ?? s).sort() }))
    .sort((a, b) => b.songs.length - a.songs.length || a.artistId.localeCompare(b.artistId));
}

/** Songs sharing verified themes with a song, most shared first, then most charted. */
export function relatedSongs(
  songId: string,
  tags: { songId: string; termId: string }[],
  chartDays: Map<string, number>,
  limit = 5,
) {
  const mine = new Set(tags.filter((t) => t.songId === songId).map((t) => t.termId));
  const overlap = new Map<string, number>();
  for (const t of tags)
    if (t.songId !== songId && mine.has(t.termId)) overlap.set(t.songId, (overlap.get(t.songId) ?? 0) + 1);
  return [...overlap]
    .sort((a, b) => b[1] - a[1] || (chartDays.get(b[0]) ?? 0) - (chartDays.get(a[0]) ?? 0) || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([id, shared]) => ({ songId: id, shared }));
}
