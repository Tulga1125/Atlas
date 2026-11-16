import { describe, expect, it } from "vitest";
import { getAtlasBusinessDate } from "./business-date";

describe("getAtlasBusinessDate", () => {
  it("uses Ulaanbaatar time rather than the server timezone", () => {
    expect(getAtlasBusinessDate(new Date("2026-08-16T16:30:00.000Z"))).toBe("2026-08-17");
  });

  it("keeps the prior business date before midnight in Ulaanbaatar", () => {
    expect(getAtlasBusinessDate(new Date("2026-08-16T15:59:59.000Z"))).toBe("2026-08-16");
  });
});
