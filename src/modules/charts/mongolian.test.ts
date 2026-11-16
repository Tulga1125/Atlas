import { expect, test } from "vitest";
import { mongolianView } from "./mongolian";
import type { ChartEntry } from "./types";

const e = (rank: number, isLocal: boolean) => ({ rank, isLocal, songId: `s${rank}` }) as ChartEntry;

test("keeps Mongolian songs only, numbered among themselves with their Top 100 rank", () => {
  const view = mongolianView([e(3, false), e(4, true), e(1, false), e(9, true)]);
  expect(view.map((v) => [v.mongolianRank, v.rank])).toEqual([[1, 4], [2, 9]]);
});

test("empty when no Mongolian song charted", () => {
  expect(mongolianView([e(1, false)])).toEqual([]);
});
