import { describe, expect, it } from "vitest";
import { getSafeStaffRedirect } from "./redirect";

describe("getSafeStaffRedirect", () => {
  it("preserves local dashboard paths", () => {
    expect(getSafeStaffRedirect("/dashboard?panel=signals")).toBe(
      "/dashboard?panel=signals",
    );
  });

  it.each([
    null,
    "https://example.com/steal",
    "//example.com/steal",
    "/\\example.com/steal",
  ])("rejects unsafe redirect target %s", (target) => {
    expect(getSafeStaffRedirect(target)).toBe("/dashboard");
  });
});
