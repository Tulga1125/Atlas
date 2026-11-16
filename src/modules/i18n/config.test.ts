import { describe, expect, it } from "vitest";
import { parseLocale } from "./config";

describe("locale configuration", () => {
  it("accepts supported locales and defaults unknown values to English", () => {
    expect(parseLocale("mn")).toBe("mn");
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale("de")).toBe("en");
    expect(parseLocale(undefined)).toBe("en");
  });
});
