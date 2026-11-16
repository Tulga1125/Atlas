import { z } from "zod";
import {
  normalizedAppleMusicEntrySchema,
  type NormalizedAppleMusicEntry,
} from "./schema";

const completeChartSchema = z.array(normalizedAppleMusicEntrySchema).length(100);

export class ChartValidationError extends Error {
  readonly code = "APPLE_CHART_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "ChartValidationError";
  }
}

export function validateCompleteChart(entries: unknown): NormalizedAppleMusicEntry[] {
  const result = completeChartSchema.safeParse(entries);

  if (!result.success) {
    throw new ChartValidationError(z.prettifyError(result.error));
  }

  const ranks = new Set(result.data.map((entry) => entry.rank));
  const itemIds = new Set(result.data.map((entry) => entry.itemId));

  if (ranks.size !== 100 || !result.data.every((entry, index) => entry.rank === index + 1)) {
    throw new ChartValidationError("Ranks must be unique and sequential from 1 through 100.");
  }

  if (itemIds.size !== 100) {
    throw new ChartValidationError("Apple Music item IDs must be unique within a snapshot.");
  }

  return result.data;
}
