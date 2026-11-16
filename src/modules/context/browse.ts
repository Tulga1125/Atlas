// C3: browse by genre, theme and scene. Pure helpers over stored facts.

export type ChartPoint = { date: string; songId: string; rank: number };

/**
 * How many songs carrying a term were on each approved chart, and how many
 * in the Top 10. Only dates that exist in the archive appear; missing days
 * stay missing.
 */
export function termHistory(points: ChartPoint[], songIds: Set<string>) {
  const dates = [...new Set(points.map((p) => p.date))].sort();
  const best = new Map<string, number>();
  for (const p of points) {
    if (!songIds.has(p.songId)) continue;
    const key = `${p.date}\u0000${p.songId}`;
    best.set(key, Math.min(best.get(key) ?? 101, p.rank));
  }
  return dates.map((date) => {
    const ranks = [...best].filter(([k]) => k.startsWith(`${date}\u0000`)).map(([, r]) => r);
    return { date, songs: ranks.length, topTen: ranks.filter((r) => r <= 10).length };
  });
}

/** Artists with the most chart days on songs carrying the term. */
export function topArtists(points: ChartPoint[], songIds: Set<string>, credits: { songId: string; artistId: string }[], limit = 10) {
  const days = new Map<string, Set<string>>();
  for (const p of points) if (songIds.has(p.songId)) days.set(p.songId, new Set([...(days.get(p.songId) ?? []), p.date]));
  const byArtist = new Map<string, { songs: Set<string>; days: number }>();
  for (const c of credits) {
    if (!songIds.has(c.songId)) continue;
    const a = byArtist.get(c.artistId) ?? { songs: new Set<string>(), days: 0 };
    if (!a.songs.has(c.songId)) {
      a.songs.add(c.songId);
      a.days += days.get(c.songId)?.size ?? 0;
    }
    byArtist.set(c.artistId, a);
  }
  return [...byArtist]
    .map(([artistId, a]) => ({ artistId, songs: a.songs.size, chartDays: a.days }))
    .filter((a) => a.chartDays > 0)
    .sort((a, b) => b.chartDays - a.chartDays || b.songs - a.songs || a.artistId.localeCompare(b.artistId))
    .slice(0, limit);
}

/** Change in the number of tagged songs on the chart compared with seven days earlier. */
export function weekChange(history: { date: string; songs: number }[]) {
  const latest = history.at(-1);
  if (!latest) return null;
  const target = new Date(Date.parse(`${latest.date}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  const before = history.find((h) => h.date === target);
  return before ? latest.songs - before.songs : null;
}
