import Link from "next/link";
import type { ChartEntry } from "@/modules/charts/types";
import type { Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { Movement } from "./movement";

type ChartTableProps = {
  entries: ChartEntry[];
  limit?: number;
  compact?: boolean;
  locale?: Locale;
};

export function ChartTable({ entries, limit, compact = false, locale = "en" }: ChartTableProps) {
  const visibleEntries = typeof limit === "number" ? entries.slice(0, limit) : entries;
  const dictionary = getDictionary(locale);

  return (
    <div className={`chart-table-wrap ${compact ? "chart-table-wrap--compact" : ""}`}>
      <table className="chart-table">
        <thead>
          <tr>
            <th scope="col">№</th>
            <th scope="col">{dictionary.table.track}</th>
            <th scope="col">{dictionary.table.move}</th>
            <th scope="col">{dictionary.table.peak}</th>
            <th scope="col">{dictionary.table.days}</th>
          </tr>
        </thead>
        <tbody>
          {visibleEntries.map((entry) => (
            <tr key={entry.songId}>
              <td className="chart-table__rank">{String(entry.rank).padStart(2, "0")}</td>
              <td>
                <Link className="chart-table__track" href={`/songs/${entry.songId}`}>
                  <span>{entry.title}</span>
                  <small>
                    {entry.artist}
                    {entry.isLocal && <span className="local-mark">MN</span>}
                  </small>
                </Link>
              </td>
              <td>
                <Movement change={entry.rankChange} locale={locale} status={entry.entryStatus} />
              </td>
              <td className="chart-table__numeric">{entry.peakRank}</td>
              <td className="chart-table__numeric">{entry.daysOnChart}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
