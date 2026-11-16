import { describe, expect, test } from "vitest";
import { accessCodeMatches, isAdminShortcut } from "./admin-code";

describe("admin shortcut", () => {
  test("only the word admin (any case, spaces trimmed)", () => {
    expect(isAdminShortcut(" Admin ")).toBe(true);
    expect(isAdminShortcut("admin@atlas.tagent.space")).toBe(false);
    expect(isAdminShortcut("administrator")).toBe(false);
    expect(isAdminShortcut(null)).toBe(false);
  });
});

describe("access code", () => {
  test("matches only the configured code", () => {
    expect(accessCodeMatches("KHAAN-2026", "KHAAN-2026")).toBe(true);
    expect(accessCodeMatches(" KHAAN-2026 ", "KHAAN-2026")).toBe(true);
    expect(accessCodeMatches("khaan-2026", "KHAAN-2026")).toBe(false);
    expect(accessCodeMatches("", "KHAAN-2026")).toBe(false);
  });
  test("is off when no code, or a too-short code, is configured", () => {
    expect(accessCodeMatches("anything", undefined)).toBe(false);
    expect(accessCodeMatches("123", "123")).toBe(false);
    expect(accessCodeMatches("8092", "8092")).toBe(true);
  });
});
