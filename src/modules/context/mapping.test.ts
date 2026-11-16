import { expect, test } from "vitest";
import { mapSourceGenres, unmappedGenres, type GenreMapping } from "./mapping";

const mappings: GenreMapping[] = [
  { source: "apple_music", sourceValue: "Hip-Hop/Rap", termId: "hip-hop", status: "verified" },
  { source: "apple_music", sourceValue: "Pop", termId: "pop", status: "suggested" },
  { source: "apple_music", sourceValue: "K-Pop", termId: "pop", status: "verified" },
  { source: "apple_music", sourceValue: "Soundtrack", termId: null, status: "verified" },
  { source: "apple_music", sourceValue: "Dance", termId: "electronic", status: "unverified" },
  { source: "musicbrainz", sourceValue: "hip hop", termId: "hip-hop", status: "verified" },
];

test("only verified mappings produce genres, with the source value as evidence", () => {
  expect(
    mapSourceGenres(
      [
        { source: "apple_music", value: "Hip-Hop/Rap" },
        { source: "apple_music", value: "Pop" },
        { source: "apple_music", value: "Dance" },
        { source: "apple_music", value: "Music" },
      ],
      mappings,
    ),
  ).toEqual([{ termId: "hip-hop", evidence: "Apple Music genre: Hip-Hop/Rap" }]);
});

test("a verified 'ignore' mapping (no term) gives nothing", () => {
  expect(mapSourceGenres([{ source: "apple_music", value: "Soundtrack" }], mappings)).toEqual([]);
});

test("two source values for one term give one suggestion, citing the first", () => {
  expect(
    mapSourceGenres(
      [
        { source: "apple_music", value: "Hip-Hop/Rap" },
        { source: "musicbrainz", value: "hip hop" },
      ],
      mappings,
    ),
  ).toEqual([{ termId: "hip-hop", evidence: "Apple Music genre: Hip-Hop/Rap" }]);
});

test("sources are kept apart: an Apple mapping never applies to a MusicBrainz value", () => {
  expect(mapSourceGenres([{ source: "musicbrainz", value: "K-Pop" }], mappings)).toEqual([]);
});

test("unmapped Apple genres are listed most common first", () => {
  expect(unmappedGenres(["Pop", "Pop", "Worldwide", "Music", "Hip-Hop/Rap"], mappings)).toEqual([
    { value: "Pop", songs: 2 },
    { value: "Worldwide", songs: 1 },
  ]);
});
