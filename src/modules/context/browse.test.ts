import { expect, test } from "vitest";
import { termHistory, topArtists, weekChange } from "./browse";

const points = [
  { date: "2026-11-01", songId: "a", rank: 3 },
  { date: "2026-11-01", songId: "a", rank: 40 }, // a second recording counts once
  { date: "2026-11-01", songId: "b", rank: 50 },
  { date: "2026-11-01", songId: "x", rank: 1 },
  { date: "2026-11-03", songId: "b", rank: 9 },
];

test("term history counts tagged songs per stored date only", () => {
  expect(termHistory(points, new Set(["a", "b"]))).toEqual([
    { date: "2026-11-01", songs: 2, topTen: 1 },
    { date: "2026-11-03", songs: 1, topTen: 1 },
  ]);
});

test("top artists by chart days on tagged songs, each song once", () => {
  expect(
    topArtists(points, new Set(["a", "b"]), [
      { songId: "a", artistId: "A" },
      { songId: "b", artistId: "A" },
      { songId: "b", artistId: "B" },
      { songId: "b", artistId: "B" },
      { songId: "x", artistId: "X" },
    ]),
  ).toEqual([
    { artistId: "A", songs: 2, chartDays: 3 },
    { artistId: "B", songs: 1, chartDays: 2 },
  ]);
});

test("week-on-week change needs the date exactly seven days earlier", () => {
  expect(weekChange([{ date: "2026-11-01", songs: 10 }, { date: "2026-11-08", songs: 16 }])).toBe(6);
  expect(weekChange([{ date: "2026-11-02", songs: 10 }, { date: "2026-11-08", songs: 16 }])).toBeNull();
  expect(weekChange([])).toBeNull();
});
