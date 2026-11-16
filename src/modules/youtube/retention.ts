import { z } from "zod";
import { getAtlasBusinessDate } from "@/modules/collection/business-date";

// Mirrors public.youtube_retention_parameters / apply_youtube_retention in
// supabase/migrations/20261116000000_youtube_retention.sql. The database is
// the authority; this module lets the app explain and preview the rules.

export const retentionModeSchema = z.enum(["30_day", "36_month"]);
export type RetentionMode = z.infer<typeof retentionModeSchema>;

export const retentionClassSchema = z.enum([
  "permanent",
  "youtube_statistics",
  "youtube_metadata",
]);
export type RetentionClass = z.infer<typeof retentionClassSchema>;

export const retentionConfigSchema = z.object({
  mode: retentionModeSchema,
  methodologyVersion: z.string().min(1),
  metadataDays: z.literal(30),
  statisticsDays: z.number().int().positive().nullable(),
  statisticsMonths: z.number().int().positive().nullable(),
});
export type RetentionConfig = z.infer<typeof retentionConfigSchema>;

export function retentionParameters(mode: RetentionMode) {
  return mode === "36_month"
    ? { mode, metadataDays: 30, statisticsDays: null, statisticsMonths: 36 }
    : { mode, metadataDays: 30, statisticsDays: 30, statisticsMonths: null };
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Postgres `date - interval 'N months'` clamps to the last day of the month.
function subtractMonths(date: string, months: number) {
  const [y, m, d] = date.split("-").map(Number);
  const index = y * 12 + (m - 1) - months;
  const year = Math.floor(index / 12);
  const month = index - year * 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export type RetentionCutoffs = {
  /** Raw YouTube responses and metadata fetched before this instant expire. */
  metadataCutoff: Date;
  /** YouTube statistics for business dates before this date expire. */
  statisticsCutoff: string;
};

export function retentionCutoffs(
  mode: RetentionMode,
  now: Date,
): RetentionCutoffs {
  const parameters = retentionParameters(mode);
  const today = getAtlasBusinessDate(now);
  return {
    metadataCutoff: new Date(
      now.getTime() - parameters.metadataDays * 86_400_000,
    ),
    statisticsCutoff:
      parameters.statisticsMonths !== null
        ? subtractMonths(today, parameters.statisticsMonths)
        : addDays(today, -parameters.statisticsDays),
  };
}

/**
 * Whether a row of the given class has expired. `observed` is the fetch time
 * for metadata and the business date (YYYY-MM-DD) for statistics.
 */
export function isExpired(
  retentionClass: RetentionClass,
  observed: Date | string,
  mode: RetentionMode,
  now: Date,
) {
  if (retentionClass === "permanent") return false;
  const cutoffs = retentionCutoffs(mode, now);
  if (retentionClass === "youtube_metadata") {
    const at = typeof observed === "string" ? new Date(observed) : observed;
    return at.getTime() < cutoffs.metadataCutoff.getTime();
  }
  const date =
    typeof observed === "string" ? observed.slice(0, 10) : getAtlasBusinessDate(observed);
  return date < cutoffs.statisticsCutoff;
}
