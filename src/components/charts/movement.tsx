import type { ChartEntryStatus } from "@/modules/charts/types";
import type { Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";

type MovementProps = {
  change: number | null;
  locale?: Locale;
  status: ChartEntryStatus;
};

export function Movement({ change, locale = "en", status }: MovementProps) {
  const dictionary = getDictionary(locale);

  if (status === "new") {
    return <span className="movement movement--new">{dictionary.table.new}</span>;
  }

  if (status === "re_entry") {
    return <span className="movement movement--return">{dictionary.table.reEntry}</span>;
  }

  if (status === "unchanged" || change === 0) {
    return <span className="movement movement--steady">—</span>;
  }

  const rising = (change ?? 0) > 0;
  return (
    <span className={`movement ${rising ? "movement--up" : "movement--down"}`}>
      <span aria-hidden="true">{rising ? "▲" : "▼"}</span> {Math.abs(change ?? 0)}
    </span>
  );
}
