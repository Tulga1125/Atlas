import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { getSongYouTube, getTrackedChart } from "./surface-data";

// A fake Supabase client that records every filter, to prove each YouTube
// read is bounded by the retention window.
function fakeDb(rows: Record<string, unknown[]> = {}) {
  const calls: { table: string; op: string; args: unknown[] }[] = [];
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const op of ["select", "eq", "neq", "in", "gte", "order", "limit", "is"])
      chain[op] = (...args: unknown[]) => {
        calls.push({ table, op, args });
        return chain;
      };
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: rows[table] ?? [], error: null, count: 0 });
    return chain;
  };
  const db = {
    rpc: async () => ({ data: { mode: "30_day", methodologyVersion: "youtube-retention-30-day-v1", metadataDays: 30, statisticsDays: 30, statisticsMonths: null }, error: null }),
    from: (table: string) => builder(table),
  };
  return { db: db as never, calls };
}

describe("retention window on reads", () => {
  test("a tracked-chart date before the window is refused without reading entries", async () => {
    const { db, calls } = fakeDb();
    const chart = await getTrackedChart(db, "2020-01-01");
    expect(chart.expired).toBe(true);
    expect(chart.entries).toEqual([]);
    expect(calls.some((c) => c.op === "eq" && c.args[0] === "business_date")).toBe(false);
  });

  test("every YouTube statistics query of a song page has a lower date bound", async () => {
    const { db, calls } = fakeDb();
    await getSongYouTube(db, "00000000-0000-4000-8000-000000000001");
    for (const table of ["youtube_song_daily_current", "youtube_tracked_chart"]) {
      const bound = calls.find((c) => c.table === table && c.op === "gte" && c.args[0] === "business_date");
      expect(bound, table).toBeDefined();
      expect(String(bound!.args[1]) >= "2026-01-01").toBe(true);
    }
  });
});
