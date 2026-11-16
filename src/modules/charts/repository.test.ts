import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  assembleLiveChartSnapshot,
  ChartDataError,
  type LiveChartRows,
} from "./repository";

const rows: LiveChartRows = {
  chart: {
    id: "00000000-0000-0000-0000-000000000010",
    name: "Apple Music Top 100: Mongolia",
  },
  snapshot: {
    id: "10000000-0000-0000-0000-000000000001",
    snapshot_date: "2026-08-19",
    collected_at: "2026-08-19T06:04:00+08:00",
    source_timestamp: "2026-08-19T06:00:00+08:00",
    status: "approved",
    entry_count: 2,
  },
  entries: [
    {
      rank: 2,
      previous_rank: 5,
      rank_change: 3,
      entry_status: "up",
      peak_rank: 2,
      days_on_chart: 4,
      momentum_score: 78,
      song_id: "20000000-0000-0000-0000-000000000002",
      platform_asset_id: "30000000-0000-0000-0000-000000000002",
    },
    {
      rank: 1,
      previous_rank: null,
      rank_change: null,
      entry_status: "new",
      peak_rank: 1,
      days_on_chart: 1,
      momentum_score: 95,
      song_id: "20000000-0000-0000-0000-000000000001",
      platform_asset_id: "30000000-0000-0000-0000-000000000001",
    },
  ],
  songs: [
    {
      id: "20000000-0000-0000-0000-000000000001",
      canonical_title: "Live Number One",
      primary_artist_id: "40000000-0000-0000-0000-000000000001",
      artwork_url: null,
      locality: "local",
    },
    {
      id: "20000000-0000-0000-0000-000000000002",
      canonical_title: "Fast Riser",
      primary_artist_id: null,
      artwork_url: "https://example.com/song.jpg",
      locality: "unknown",
    },
  ],
  artists: [
    {
      id: "40000000-0000-0000-0000-000000000001",
      canonical_name: "Atlas Artist",
      locality: "local",
    },
  ],
  assets: [
    {
      id: "30000000-0000-0000-0000-000000000001",
      platform_url: "https://music.apple.com/mn/song/one",
      artwork_url: "https://example.com/one.jpg",
      platform_artist_name: "Source Artist",
    },
    {
      id: "30000000-0000-0000-0000-000000000002",
      platform_url: "https://music.apple.com/mn/song/two",
      artwork_url: null,
      platform_artist_name: "Fallback Artist",
    },
  ],
};

describe("assembleLiveChartSnapshot", () => {
  it("orders database rows and maps catalog/source fallbacks", () => {
    const snapshot = assembleLiveChartSnapshot(rows);

    expect(snapshot.isDemo).toBe(false);
    expect(snapshot.entries.map((entry) => entry.rank)).toEqual([1, 2]);
    expect(snapshot.entries[0]).toMatchObject({
      title: "Live Number One",
      artist: "Atlas Artist",
      artworkUrl: "https://example.com/one.jpg",
      isLocal: true,
    });
    expect(snapshot.entries[1]).toMatchObject({
      artist: "Fallback Artist",
      artworkUrl: "https://example.com/song.jpg",
    });
  });

  it("rejects an approved snapshot with missing entries", () => {
    expect(() =>
      assembleLiveChartSnapshot({
        ...rows,
        entries: rows.entries.slice(0, 1),
      }),
    ).toThrowError(ChartDataError);
  });
});
