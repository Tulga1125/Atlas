import { describe, expect, test } from "vitest";
import {
  isExpired,
  retentionConfigSchema,
  retentionCutoffs,
  retentionParameters,
} from "./retention";

const now = new Date("2026-03-15T00:00:00Z"); // 08:00 in Ulaanbaatar

describe("30-day mode", () => {
  test("metadata and statistics both expire after 30 days", () => {
    const cutoffs = retentionCutoffs("30_day", now);
    expect(cutoffs.metadataCutoff.toISOString()).toBe("2026-02-13T00:00:00.000Z");
    expect(cutoffs.statisticsCutoff).toBe("2026-02-13");
    expect(isExpired("youtube_statistics", "2026-02-12", "30_day", now)).toBe(true);
    expect(isExpired("youtube_statistics", "2026-02-13", "30_day", now)).toBe(false);
    expect(isExpired("youtube_metadata", "2026-02-12T23:59:59Z", "30_day", now)).toBe(true);
    expect(isExpired("youtube_metadata", "2026-02-13T00:00:01Z", "30_day", now)).toBe(false);
  });
});

describe("36-month mode", () => {
  test("statistics are kept for 36 calendar months", () => {
    const cutoffs = retentionCutoffs("36_month", now);
    expect(cutoffs.statisticsCutoff).toBe("2023-03-15");
    expect(isExpired("youtube_statistics", "2023-03-14", "36_month", now)).toBe(true);
    expect(isExpired("youtube_statistics", "2026-01-01", "36_month", now)).toBe(false);
  });

  test("titles and raw responses still expire after 30 days", () => {
    expect(retentionCutoffs("36_month", now).metadataCutoff).toEqual(
      retentionCutoffs("30_day", now).metadataCutoff,
    );
    expect(isExpired("youtube_metadata", "2026-01-01T00:00:00Z", "36_month", now)).toBe(true);
  });

  test("month arithmetic clamps like Postgres", () => {
    expect(
      retentionCutoffs("36_month", new Date("2029-02-28T12:00:00Z")).statisticsCutoff,
    ).toBe("2026-02-28");
    expect(
      retentionCutoffs("36_month", new Date("2027-05-31T12:00:00Z")).statisticsCutoff,
    ).toBe("2024-05-31");
    expect(
      retentionCutoffs("36_month", new Date("2027-03-31T12:00:00Z")).statisticsCutoff,
    ).toBe("2024-03-31");
  });
});

test("business date follows Ulaanbaatar, not UTC", () => {
  // 20:00 UTC on 14 March is already 15 March in Ulaanbaatar.
  expect(
    retentionCutoffs("30_day", new Date("2026-03-14T20:00:00Z")).statisticsCutoff,
  ).toBe("2026-02-13");
});

test("permanent rows never expire in either mode", () => {
  for (const mode of ["30_day", "36_month"] as const)
    expect(isExpired("permanent", "2000-01-01", mode, now)).toBe(false);
});

test("parameters match the database configuration shape", () => {
  for (const mode of ["30_day", "36_month"] as const)
    expect(
      retentionConfigSchema.parse({
        ...retentionParameters(mode),
        methodologyVersion: "youtube-retention-30-day-v1",
      }).mode,
    ).toBe(mode);
});
