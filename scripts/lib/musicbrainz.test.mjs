import { describe, expect, it } from "vitest";
import { discoverArtists, validateImport } from "./musicbrainz.mjs";

const artist = { id: "90000000-0000-4000-8000-000000000001", name: "Test Artist", country: "MN" };
const discovery = { source: "musicbrainz", query: "country:MN", fetchedAt: "2026-09-06T00:00:00Z", count: 1, artists: [artist] };
const curated = { mbid: artist.id, name: "Test Artist", biography: "Test-only biography.", sourceUrl: "https://example.com/artist", sourceName: "Test source", evidenceType: "official_profile", notes: "Test evidence.", checkedAt: "2026-09-06" };
describe("artist import validation", () => {
  it("defaults source-listed artists to an unreviewed discovery batch", () => {
    expect(validateImport(discovery).curated).toEqual([]);
  });
  it("rejects truncated and duplicate source records", () => {
    expect(() => validateImport({ ...discovery, count: 2 })).toThrow(/Incomplete/);
    expect(() => validateImport({ ...discovery, count: 2, artists: [artist, artist] })).toThrow(/duplicate/);
  });
  it("requires an exact source ID for curated identities", () => {
    expect(() => validateImport(discovery, [{ ...curated, mbid: "90000000-0000-4000-8000-000000000099" }])).toThrow(/missing/);
    expect(validateImport(discovery, [curated]).curated).toHaveLength(1);
  });
  it("rejects unsafe evidence and missing source notes", () => {
    expect(() => validateImport(discovery, [{ ...curated, sourceUrl: "javascript:alert(1)" }])).toThrow();
    expect(() => validateImport(discovery, [{ ...curated, notes: "" }])).toThrow();
  });
});

it("partitions tied search results by MBID and spaces every request", async () => {
  const records = Array.from({ length: 101 }, (_, i) => ({ ...artist, id: `${i < 51 ? "0" : "4"}0000000-0000-4000-8000-${String(i).padStart(12, "0")}` }));
  const waits = [], queries = [];
  const result = await discoverArtists({
    wait: async ms => { waits.push(ms); },
    fetcher: async url => {
      const query = url.searchParams.get("query");
      queries.push(query);
      const rows = query === "country:MN" ? records : query.includes("0*") ? records.slice(0, 51) : query.includes("4*") ? records.slice(51) : [];
      return new Response(JSON.stringify({ count: rows.length, artists: rows.slice(0, 100) }), { status: 200 });
    },
  });
  expect(result.count).toBe(101);
  expect(new Set(result.artists.map(a => a.id)).size).toBe(101);
  expect(queries).toHaveLength(5);
  expect(waits.every(ms => ms >= 1000)).toBe(true);
});

it("does not accept additional lookups without explicit curated evidence", () => {
  expect(() => validateImport({ ...discovery, additionalArtistIds: [artist.id] })).toThrow(/curated manifest/);
});
