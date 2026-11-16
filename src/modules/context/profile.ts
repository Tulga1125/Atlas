// Artist genre/theme/mood profile (C1, context-profile-v1): the share of an
// artist's verified-tagged songs carrying each term, per dimension. Calculated
// from verified tags only, never typed. Optionally weighted by chart days.

export const PROFILE_METHOD = "context-profile-v1";

export type ProfileSong = { songId: string; artistIds: string[]; chartDays: number };
export type VerifiedTag = { songId: string; termId: string; dimension: "genre" | "theme" | "mood" };
export type ProfileRow = {
  artistId: string;
  dimension: VerifiedTag["dimension"];
  termId: string;
  share: number;
  songs: number;
  taggedSongs: number;
  totalSongs: number;
};

export function calculateArtistProfiles(
  songs: ProfileSong[],
  tags: VerifiedTag[],
  options: { weightByChartDays: boolean } = { weightByChartDays: false },
): ProfileRow[] {
  const tagsBySong = new Map<string, VerifiedTag[]>();
  for (const tag of tags) tagsBySong.set(tag.songId, [...(tagsBySong.get(tag.songId) ?? []), tag]);
  const songsByArtist = new Map<string, ProfileSong[]>();
  for (const song of songs)
    for (const artistId of new Set(song.artistIds))
      songsByArtist.set(artistId, [...(songsByArtist.get(artistId) ?? []), song]);

  const rows: ProfileRow[] = [];
  for (const [artistId, artistSongs] of songsByArtist) {
    for (const dimension of ["genre", "theme", "mood"] as const) {
      const tagged = artistSongs.filter((s) => tagsBySong.get(s.songId)?.some((t) => t.dimension === dimension));
      if (tagged.length === 0) continue;
      const weight = (s: ProfileSong) => (options.weightByChartDays ? Math.max(1, s.chartDays) : 1);
      const total = tagged.reduce((sum, s) => sum + weight(s), 0);
      const byTerm = new Map<string, { weight: number; songs: number }>();
      for (const song of tagged) {
        const terms = new Set(tagsBySong.get(song.songId)!.filter((t) => t.dimension === dimension).map((t) => t.termId));
        for (const termId of terms) {
          const current = byTerm.get(termId) ?? { weight: 0, songs: 0 };
          byTerm.set(termId, { weight: current.weight + weight(song), songs: current.songs + 1 });
        }
      }
      for (const [termId, value] of byTerm)
        rows.push({
          artistId,
          dimension,
          termId,
          share: Math.round((value.weight / total) * 100_000) / 100_000,
          songs: value.songs,
          taggedSongs: tagged.length,
          totalSongs: artistSongs.length,
        });
    }
  }
  return rows.sort(
    (a, b) =>
      a.artistId.localeCompare(b.artistId) ||
      a.dimension.localeCompare(b.dimension) ||
      b.share - a.share ||
      a.termId.localeCompare(b.termId),
  );
}
