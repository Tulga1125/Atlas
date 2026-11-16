import { describe, expect, test } from "vitest";
import { detectAnomalies, type DayInput } from "./anomalies";

const available = (videoId: string, views: number) => ({ videoId, availability: "available" as const, viewCount: String(views), likeCount: null, commentCount: null });
const base = (over: Partial<DayInput> = {}): DayInput => ({
  date: "2026-11-16",
  rows: [available("aaaaaaaaaaa", 1000)],
  previous: new Map([["aaaaaaaaaaa", { date: "2026-11-15", views: 900, availability: "available" as const }]]),
  publishedAt: new Map([["aaaaaaaaaaa", "2019-01-01T00:00:00Z"]]),
  primaryConflicts: [],
  primaryChanges: [],
  stale: false,
  ...over,
});
const types = (input: DayInput) => detectAnomalies(input).map((a) => a.type);

test("a clean day raises nothing", () => {
  expect(types(base())).toEqual([]);
});

describe("each rule triggers, and has a near miss", () => {
  test("yt_view_count_decrease", () => {
    expect(types(base({ rows: [available("aaaaaaaaaaa", 899)] }))).toEqual(["yt_view_count_decrease"]);
    expect(types(base({ rows: [available("aaaaaaaaaaa", 900)] }))).toEqual([]);
  });
  test("yt_implausible_jump: a seven-year-old video gains 40%+ in a day", () => {
    expect(types(base({ rows: [available("aaaaaaaaaaa", 1300)] }))).toEqual(["yt_implausible_jump"]);
    expect(types(base({ rows: [available("aaaaaaaaaaa", 1200)] }))).toEqual([]); // 33%
    // A new release may legitimately double.
    expect(types(base({ rows: [available("aaaaaaaaaaa", 5000)], publishedAt: new Map([["aaaaaaaaaaa", "2026-11-10T00:00:00Z"]]) }))).toEqual([]);
  });
  test("yt_video_unavailable", () => {
    expect(types(base({ rows: [{ videoId: "aaaaaaaaaaa", availability: "missing" }] }))).toEqual(["yt_video_unavailable", "yt_partial_collection"]);
    // Never seen before: not an availability change.
    expect(types(base({ rows: [{ videoId: "bbbbbbbbbbb", availability: "missing" }, ...Array.from({ length: 9 }, (_, i) => available(`ok${String(i).padStart(9, "0")}`, 1))], previous: new Map() }))).toEqual([]);
  });
  test("yt_asset_conflict", () => {
    expect(types(base({ primaryConflicts: [{ songId: "s", videoIds: ["a", "b"] }] }))).toEqual(["yt_asset_conflict"]);
    expect(detectAnomalies(base({ primaryChanges: [{ songId: "s", from: "a", to: "b" }] }))[0]).toMatchObject({ type: "yt_asset_conflict", severity: "low" });
    expect(types(base({ primaryConflicts: [], primaryChanges: [] }))).toEqual([]);
  });
  test("yt_stale_payload", () => {
    expect(types(base({ stale: true }))).toEqual(["yt_stale_payload"]);
  });
  test("yt_partial_collection above 20% missing", () => {
    const rows = [...Array.from({ length: 7 }, (_, i) => available(`ok${String(i).padStart(9, "0")}`, 1)), ...["m1", "m2", "m3"].map((v) => ({ videoId: v.padEnd(11, "x"), availability: "missing" as const }))];
    expect(types(base({ rows, previous: new Map() }))).toEqual(["yt_partial_collection"]);
    const atLimit = [...Array.from({ length: 8 }, (_, i) => available(`ok${String(i).padStart(9, "0")}`, 1)), ...rows.slice(7, 9)];
    expect(types(base({ rows: atLimit, previous: new Map() }))).toEqual([]); // 2 of 10 = exactly 20%
  });
  test("yt_methodology_break on the break dates only", () => {
    expect(detectAnomalies(base({ date: "2026-08-27" }))).toEqual([expect.objectContaining({ type: "yt_methodology_break", severity: "low" })]);
    expect(types(base({ date: "2026-08-28" }))).toEqual([]);
  });
});

test("every anomaly carries its rule version and the date", () => {
  for (const a of detectAnomalies(base({ stale: true, rows: [available("aaaaaaaaaaa", 1)] })))
    expect([a.ruleVersion, a.evidence.date]).toEqual(["yt-anomalies-v1", "2026-11-16"]);
});
