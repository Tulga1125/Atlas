import { describe, expect, it } from "vitest";
import { testSnapshot } from "../../../tests/fixtures/chart";
import { toChartCsv, toPublicChartResponse } from "./public-response";

describe("public chart representations", () => {
  it.each([
    '=WEBSERVICE("https://example.com")',
    "+SUM(1,2)",
    "-2+3",
    "@SUM(A1)",
    "  =1+1",
    "\t=1+1",
  ])("neutralizes formula text %s", (title) => {
    const csv = toChartCsv({
      ...testSnapshot,
      entries: [{ ...testSnapshot.entries[0], title }],
    });
    expect(csv).toContain("'");
    expect(csv).not.toMatch(/\r\n1,=?WEBSERVICE/);
  });
  it("marks approved data as real in the JSON contract", () => {
    expect(toPublicChartResponse(testSnapshot)).toMatchObject({
      snapshot: {
        isDemo: false,
        entryCount: 10,
      },
      chart: {
        source: "apple_music",
      },
    });
  });

  it("exports spreadsheet-safe CSV rows", () => {
    const snapshot = {
      ...testSnapshot,
      entries: [
        {
          ...testSnapshot.entries[0],
          title: 'Snow, Then "Sun"',
        },
      ],
    };
    const csv = toChartCsv(snapshot);

    expect(csv).toContain('"Snow, Then ""Sun"""');
    expect(csv.split("\r\n")).toHaveLength(2);
    expect(csv).toContain("snapshot_date");
  });
});
