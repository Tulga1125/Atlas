import "server-only";
import { unstable_cache } from "next/cache";

import { getMissingPublicDataConfiguration } from "@/lib/env";
import { ChartDataError, getLatestApprovedChartSnapshot } from "./repository";
import type { ChartSnapshot } from "./types";

const cachedSnapshot = unstable_cache(
  getLatestApprovedChartSnapshot,
  ["atlas-approved-charts"],
  { revalidate: 60, tags: ["atlas-charts"] },
);

/** Absence is expected before launch; configuration and database failures still surface. */
export async function getOptionalChartSnapshot(snapshotDate?: string): Promise<ChartSnapshot | null> {
  try {
    return await getCurrentChartSnapshot(snapshotDate);
  } catch (error) {
    if (error instanceof ChartDataError && error.code === "not_found") return null;
    throw error;
  }
}

export async function getCurrentChartSnapshot(
  snapshotDate?: string,
): Promise<ChartSnapshot> {
  const missingConfiguration = getMissingPublicDataConfiguration();
  if (missingConfiguration.length > 0) {
    throw new ChartDataError(
      "not_configured",
      `Public chart data is not configured: ${missingConfiguration.join(", ")}`,
    );
  }

  const snapshot = await cachedSnapshot(snapshotDate);
  if (!snapshot) {
    throw new ChartDataError(
      "not_found",
      snapshotDate
        ? `No approved snapshot exists for ${snapshotDate}.`
        : "No approved chart snapshot is available.",
    );
  }

  return snapshot;
}
