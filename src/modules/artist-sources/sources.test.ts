import { describe, expect, it } from "vitest";
import { normalizeAppleArtist } from "./apple-music";
import { normalizeYouTubeChannel } from "./youtube";

describe("Apple Music artist normalization", () => {
  it("preserves catalog identity and resolves artwork templates", () => {
    expect(
      normalizeAppleArtist({
        id: "123456",
        type: "artists",
        attributes: {
          name: "Artist Name",
          url: "https://music.apple.com/mn/artist/artist-name/123456",
          genreNames: ["Hip-Hop/Rap"],
          artwork: {
            url: "https://example.com/{w}x{h}bb.{f}",
          },
          editorialNotes: {
            short: "Short biography",
            standard: "Full biography",
          },
        },
      }),
    ).toEqual({
      artistId: "123456",
      name: "Artist Name",
      profileUrl: "https://music.apple.com/mn/artist/artist-name/123456",
      artworkUrl: "https://example.com/800x800bb.jpg",
      biography: "Full biography",
      genres: ["Hip-Hop/Rap"],
    });
  });
});

describe("YouTube channel normalization", () => {
  it("retains public channel statistics and omits hidden subscribers", () => {
    const channel = normalizeYouTubeChannel({
      id: "UC-atlas",
      snippet: {
        title: "Atlas Artist",
        customUrl: "@atlasartist",
        thumbnails: {
          high: { url: "https://example.com/avatar.jpg" },
        },
      },
      statistics: {
        viewCount: "987654",
        subscriberCount: "12000",
        hiddenSubscriberCount: true,
        videoCount: "42",
      },
    });

    expect(channel.profileUrl).toBe(
      "https://www.youtube.com/channel/UC-atlas",
    );
    expect(channel.metrics).toEqual([
      { name: "total_views", value: "987654", unit: "views" },
      { name: "video_count", value: "42", unit: "videos" },
    ]);
  });

  it("includes subscriber counts when the channel publishes them", () => {
    const channel = normalizeYouTubeChannel({
      id: "UC-public",
      snippet: { title: "Public Artist" },
      statistics: {
        viewCount: "2000",
        subscriberCount: "500",
        hiddenSubscriberCount: false,
        videoCount: "10",
      },
    });

    expect(channel.metrics[0]).toEqual({
      name: "subscribers",
      value: "500",
      unit: "people",
    });
  });
});
