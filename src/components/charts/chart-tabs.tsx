import Link from "next/link";
import type { Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";

/** Atlas (main) · YouTube · Apple Music. */
export function ChartTabs({ locale, active }: { locale: Locale; active: "atlas" | "youtube" | "apple" }) {
  const copy = getDictionary(locale).charts;
  const tabs = [
    ["atlas", "/charts/atlas-mongolia", copy.atlas],
    ["youtube", "/charts/youtube-mongolia", copy.youtube],
    ["apple", "/charts/apple-music-mongolia", copy.apple],
  ] as const;
  return (
    <nav className="chart-tabs" aria-label={copy.tabsLabel}>
      {tabs.map(([key, href, label]) => (
        <Link key={key} href={href} aria-current={active === key ? "page" : undefined}>{label}</Link>
      ))}
    </nav>
  );
}
