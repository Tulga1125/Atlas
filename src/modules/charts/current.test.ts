import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/env", () => ({ getMissingPublicDataConfiguration: () => [] }));
vi.mock("./repository", async (original) => {
  const actual = await original<typeof import("./repository")>();
  return { ...actual, getLatestApprovedChartSnapshot: vi.fn() };
});
import { getOptionalChartSnapshot } from "./current";
import { getLatestApprovedChartSnapshot } from "./repository";
beforeEach(() => vi.resetAllMocks());
it("allows an empty database without substituting chart data", async () => {
  vi.mocked(getLatestApprovedChartSnapshot).mockResolvedValue(null);
  await expect(getOptionalChartSnapshot()).resolves.toBeNull();
});
it("does not disguise database outages as an unpublished chart", async () => {
  vi.mocked(getLatestApprovedChartSnapshot).mockRejectedValue(new Error("Database unavailable"));
  await expect(getOptionalChartSnapshot()).rejects.toThrow("Database unavailable");
});
