import { describe, expect, it } from "vitest";
import { normalizeAppleMusicChart } from "./normalize";
import type { AppleMusicChartResponse } from "./schema";
import { ChartValidationError, validateCompleteChart } from "./validate";

function makeResponse(count = 100): AppleMusicChartResponse {
  return {
    results: {
      songs: [
        {
          chart: "most-played",
          name: "Top Songs",
          data: Array.from({ length: count }, (_, index) => ({
            id: String(1_000 + index),
            type: "songs" as const,
            attributes: {
              name: `Song ${index + 1}`,
              artistName: `Artist ${index + 1}`,
              artistUrl: `https://music.apple.com/mn/artist/example/${2_000 + index}`,
              genreNames: ["Pop", "Music"],
              artwork: {
                url: "https://is1-ssl.mzstatic.com/image/{w}x{h}bb.jpg",
              },
            },
          })),
        },
      ],
    },
  };
}

describe("Apple Music chart normalization", () => {
  it("turns response order into stable 1-based ranks", () => {
    const entries = normalizeAppleMusicChart(makeResponse());

    expect(entries).toHaveLength(100);
    expect(entries[0]).toMatchObject({
      rank: 1,
      itemId: "1000",
      artistId: "2000",
      primaryGenre: "Pop",
      artworkUrl: "https://is1-ssl.mzstatic.com/image/600x600bb.jpg",
    });
    expect(entries[99]?.rank).toBe(100);
  });

  it("rejects an incomplete chart", () => {
    const entries = normalizeAppleMusicChart(makeResponse(99));
    expect(() => validateCompleteChart(entries)).toThrow(ChartValidationError);
  });

  it("rejects duplicate source IDs", () => {
    const entries = normalizeAppleMusicChart(makeResponse());
    entries[99] = { ...entries[99]!, itemId: entries[0]!.itemId };
    expect(() => validateCompleteChart(entries)).toThrow("item IDs must be unique");
  });
});
