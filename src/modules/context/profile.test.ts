import { expect, test } from "vitest";
import { calculateArtistProfiles, type ProfileSong, type VerifiedTag } from "./profile";

const songs: ProfileSong[] = [
  { songId: "s1", artistIds: ["a"], chartDays: 30 },
  { songId: "s2", artistIds: ["a"], chartDays: 10 },
  { songId: "s3", artistIds: ["a", "b"], chartDays: 60 },
  { songId: "s4", artistIds: ["a"], chartDays: 5 }, // untagged
];
const tags: VerifiedTag[] = [
  { songId: "s1", termId: "love", dimension: "theme" },
  { songId: "s2", termId: "love", dimension: "theme" },
  { songId: "s3", termId: "homeland", dimension: "theme" },
  { songId: "s3", termId: "pop", dimension: "genre" },
];

test("share of tagged songs per term, with N of M visible", () => {
  const rows = calculateArtistProfiles(songs, tags).filter((r) => r.artistId === "a" && r.dimension === "theme");
  expect(rows).toEqual([
    { artistId: "a", dimension: "theme", termId: "love", share: 0.66667, songs: 2, taggedSongs: 3, totalSongs: 4 },
    { artistId: "a", dimension: "theme", termId: "homeland", share: 0.33333, songs: 1, taggedSongs: 3, totalSongs: 4 },
  ]);
});

test("weighting by chart days", () => {
  const rows = calculateArtistProfiles(songs, tags, { weightByChartDays: true }).filter((r) => r.artistId === "a" && r.dimension === "theme");
  expect(rows.map((r) => [r.termId, r.share])).toEqual([
    ["homeland", 0.6],
    ["love", 0.4],
  ]);
});

test("a co-credited song counts for every credited artist", () => {
  const rows = calculateArtistProfiles(songs, tags).filter((r) => r.artistId === "b");
  expect(rows.map((r) => `${r.dimension}:${r.termId}:${r.share}:${r.taggedSongs}/${r.totalSongs}`)).toEqual(["genre:pop:1:1/1", "theme:homeland:1:1/1"]);
});

test("no tags means no profile, not an empty share", () => {
  expect(calculateArtistProfiles([{ songId: "x", artistIds: ["c"], chartDays: 1 }], [])).toEqual([]);
});

test("shares within a dimension can exceed 100% in total when songs carry several terms", () => {
  const rows = calculateArtistProfiles(
    [{ songId: "s1", artistIds: ["a"], chartDays: 1 }],
    [
      { songId: "s1", termId: "love", dimension: "theme" },
      { songId: "s1", termId: "nostalgia", dimension: "theme" },
    ],
  );
  expect(rows.map((r) => r.share)).toEqual([1, 1]);
});

test("input order does not change the result", () => {
  expect(calculateArtistProfiles([...songs].reverse(), [...tags].reverse())).toEqual(calculateArtistProfiles(songs, tags));
});
