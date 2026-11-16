import { describe, expect, test } from "vitest";
import { addDays, computeWeek, computeWeeks, weekStartOf, type AppleDay, type YouTubeDay } from "./atlas-weekly";

const MON = "2026-11-16"; // a Monday
const days = (start: string, n: number) => Array.from({ length: n }, (_, i) => addDays(start, i));
const appleEvery = (songId: string, rank: number, dates: string[]): AppleDay[] => dates.map((date) => ({ date, songId, rank }));
const ytEvery = (songId: string, views: number, dates: string[], multiDay = false): YouTubeDay[] => dates.map((date) => ({ date, songId, views, multiDay }));
const AFTER = "2026-12-31";

describe("week boundaries", () => {
  test("weeks run Monday to Sunday", () => {
    expect(weekStartOf("2026-11-22")).toBe(MON); // Sunday
    expect(weekStartOf("2026-11-16")).toBe(MON);
    expect(weekStartOf("2026-11-23")).toBe("2026-11-23");
  });
});

describe("computeWeek", () => {
  const week = days(MON, 7);

  test("No. 1 on Apple every day and the most-watched song scores 1.0", () => {
    const w = computeWeek(MON, appleEvery("a", 1, week), week, ytEvery("a", 1000, week), AFTER);
    expect(w.entries[0]).toMatchObject({ songId: "a", score: 1, apple: { score: 1, days: 7, bestRank: 1 }, youtube: { score: 1, views: 7000 } });
    expect(w.status).toBe("final");
  });

  test("score = 0.6 × Apple + 0.4 × YouTube, and a YouTube-only song can chart", () => {
    const w = computeWeek(MON, appleEvery("apple", 51, week), week, ytEvery("yt", 500, week), AFTER);
    const by = Object.fromEntries(w.entries.map((e) => [e.songId, e.score]));
    expect(by.apple).toBe(0.3); // A = 50/100, Y = 0
    expect(by.yt).toBe(0.4); // A = 0, Y = 1
    expect(w.entries.map((e) => e.songId)).toEqual(["yt", "apple"]);
  });

  test("a missing Apple day does not count against songs", () => {
    const six = week.slice(0, 6);
    const w = computeWeek(MON, appleEvery("a", 1, six), six, ytEvery("a", 1, week), AFTER);
    expect(w.entries[0].apple.score).toBe(1);
    expect(w.appleDays).toBe(6);
  });

  test("ties break on Apple score, then views, then song ID", () => {
    const w = computeWeek(MON, [], week, [...ytEvery("b", 10, week), ...ytEvery("a", 10, week)], AFTER);
    expect(w.entries.map((e) => e.songId)).toEqual(["a", "b"]);
  });

  test("only the top 50 are kept", () => {
    const yt = Array.from({ length: 60 }, (_, i) => ytEvery(`s${String(i).padStart(2, "0")}`, 100 - i, week)).flat();
    expect(computeWeek(MON, [], week, yt, AFTER).entries).toHaveLength(50);
  });

  test("statuses: running week is provisional; a thin week is insufficient", () => {
    expect(computeWeek(MON, [], week, ytEvery("a", 1, week), "2026-11-20").status).toBe("provisional");
    expect(computeWeek(MON, [], week.slice(0, 2), ytEvery("a", 1, week), AFTER).status).toBe("insufficient");
  });

  test("a multi-day YouTube gap is counted once and flagged", () => {
    const w = computeWeek(MON, [], week, [{ date: week[3], songId: "a", views: 300, multiDay: true }], AFTER);
    expect(w.entries[0].youtube).toMatchObject({ views: 300, includesGap: true });
  });

  test("is deterministic regardless of input order", () => {
    const apple = [...appleEvery("a", 3, week), ...appleEvery("b", 5, week)];
    const yt = [...ytEvery("a", 9, week), ...ytEvery("b", 20, week)];
    expect(computeWeek(MON, [...apple].reverse(), week, [...yt].reverse(), AFTER)).toEqual(computeWeek(MON, apple, week, yt, AFTER));
  });
});

test("computeWeeks adds movement, peak, weeks on chart and re-entries", () => {
  const w1 = days(MON, 7), w2 = days(addDays(MON, 7), 7), w3 = days(addDays(MON, 14), 7);
  const apple = [...appleEvery("a", 1, w1), ...appleEvery("b", 2, w1), ...appleEvery("b", 1, w2), ...appleEvery("a", 2, w2), ...appleEvery("a", 1, w3)];
  const charts = computeWeeks([MON, addDays(MON, 7), addDays(MON, 14)], apple, [...w1, ...w2, ...w3], [...ytEvery("x", 1, w1), ...ytEvery("x", 1, w2), ...ytEvery("x", 1, w3)], AFTER);
  const b2 = charts[1].entries.find((e) => e.songId === "b")!;
  expect(b2).toMatchObject({ rank: 1, previousRank: 2, change: 1, status: "up", weeksOnChart: 2, peak: 1 });
  const a3 = charts[2].entries.find((e) => e.songId === "a")!;
  expect(a3).toMatchObject({ rank: 1, status: "up", weeksOnChart: 3, peak: 1 });
  expect(charts[2].entries.find((e) => e.songId === "b")).toBeUndefined();
});
