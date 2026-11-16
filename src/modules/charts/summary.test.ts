import { describe, expect, it } from "vitest";
import { testSnapshot } from "../../../tests/fixtures/chart";
import { summarizeChart } from "./summary";

describe("summarizeChart", () => {
  it("derives the daily command-center totals", () => {
    expect(summarizeChart(testSnapshot)).toMatchObject({
      numberOneChanged: true,
      newEntries: 1,
      reEntries: 1,
      localEntries: 6,
      risingEntries: 4,
    });
  });

  it("selects the largest positive rank change", () => {
    expect(summarizeChart(testSnapshot).biggestGainer).toMatchObject({
      title: "East Gate",
      rankChange: 12,
    });
  });
});
