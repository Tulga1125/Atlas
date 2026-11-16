import { describe, expect, test } from "vitest";
import { collaborations, milestones, profileBars, relatedSongs, similarArtists } from "./page-model";

describe("milestones", () => {
  test("first entry, first Top 10, each No. 1 once, from chart history", () => {
    const m = milestones([
      { songId: "a", title: "A", history: [{ date: "2026-01-01", rank: 40 }, { date: "2026-01-05", rank: 1 }, { date: "2026-01-06", rank: 1 }] },
      { songId: "b", title: "B", history: [{ date: "2026-01-03", rank: 8 }] },
    ]);
    expect(m.map((x) => `${x.date}:${x.kind}:${x.songId}`)).toEqual([
      "2026-01-01:first_entry:a",
      "2026-01-03:first_top_ten:b",
      "2026-01-05:number_one:a",
    ]);
  });
  test("career peak when the artist never reached No. 1", () => {
    const m = milestones([{ songId: "a", title: "A", history: [{ date: "2026-01-01", rank: 30 }, { date: "2026-01-02", rank: 12 }, { date: "2026-01-09", rank: 12 }] }]);
    expect(m.find((x) => x.kind === "career_peak")).toMatchObject({ date: "2026-01-02", rank: 12 });
    expect(m.some((x) => x.kind === "first_top_ten")).toBe(false);
  });
  test("no history, no milestones", () => {
    expect(milestones([{ songId: "a", title: "A", history: [] }])).toEqual([]);
  });
});

test("profile bars keep N of M visible and sort by share", () => {
  const terms = [{ id: "love", slug: "love", label: "Love" }, { id: "home", slug: "homeland", label: "Homeland" }];
  expect(
    profileBars(
      [
        { dimension: "theme", termId: "home", share: 0.25, songs: 1, taggedSongs: 4, totalSongs: 9 },
        { dimension: "theme", termId: "love", share: 0.625, songs: 3, taggedSongs: 4, totalSongs: 9 },
        { dimension: "genre", termId: "pop", share: 1, songs: 4, taggedSongs: 4, totalSongs: 9 },
      ],
      terms,
      "theme",
    ),
  ).toEqual({
    bars: [
      { termId: "love", slug: "love", label: "Love", percent: 63, songs: 3 },
      { termId: "home", slug: "homeland", label: "Homeland", percent: 25, songs: 1 },
    ],
    tagged: 4,
    total: 9,
  });
  expect(profileBars([], terms, "theme")).toEqual({ bars: [], tagged: 0, total: 0 });
});

test("similar artists explain themselves with shared terms", () => {
  const target = { artistId: "t", rows: [{ dimension: "genre", termId: "hiphop", share: 1 }, { dimension: "theme", termId: "hustle", share: 0.6 }, { dimension: "theme", termId: "love", share: 0.4 }] };
  const similar = similarArtists(target, [
    target,
    { artistId: "x", rows: [{ dimension: "genre", termId: "hiphop", share: 0.8 }, { dimension: "theme", termId: "hustle", share: 0.5 }] },
    { artistId: "y", rows: [{ dimension: "genre", termId: "pop", share: 1 }, { dimension: "theme", termId: "love", share: 1 }] },
  ]);
  expect(similar).toEqual([{ artistId: "x", score: 0.65, shared: ["hiphop", "hustle"] }]);
});

test("collaborations list co-credited artists with shared songs", () => {
  expect(
    collaborations(
      "me",
      [
        { songId: "s1", artistId: "me" },
        { songId: "s1", artistId: "x" },
        { songId: "s2", artistId: "me" },
        { songId: "s2", artistId: "x" },
        { songId: "s3", artistId: "y" },
      ],
      new Map([["s1", "One"], ["s2", "Two"]]),
    ),
  ).toEqual([{ artistId: "x", songs: ["One", "Two"] }]);
});

test("related songs by shared verified themes", () => {
  expect(
    relatedSongs(
      "s1",
      [
        { songId: "s1", termId: "love" },
        { songId: "s1", termId: "nostalgia" },
        { songId: "s2", termId: "love" },
        { songId: "s3", termId: "love" },
        { songId: "s3", termId: "nostalgia" },
        { songId: "s4", termId: "homeland" },
      ],
      new Map([["s2", 50], ["s3", 2]]),
    ),
  ).toEqual([
    { songId: "s3", shared: 2 },
    { songId: "s2", shared: 1 },
  ]);
});
