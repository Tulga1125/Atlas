import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { SiteHeader } from "@/components/atlas/site-header";
import { ChartTabs } from "@/components/charts/chart-tabs";
import { AtlasChartTable } from "@/components/charts/public-charts";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAtlasWeekly } from "@/modules/charts/atlas-weekly-data";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocale } from "@/modules/i18n/server";

export const metadata: Metadata = { title: "Atlas Mongolia Top 50" };
export const dynamic = "force-dynamic";

// The main chart (owner, 2026-11-17): weekly, Mongolian artists, Apple Music
// position (60%) + YouTube views gained (40%). Computed from stored evidence
// with the server-only client, inside the YouTube retention window.
export default async function AtlasMongoliaChart({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const copy = dictionary.charts;
  const wk = dictionary.atlasWeekly;
  const requested = z.iso.date().safeParse((await searchParams).week);
  const { charts, songs, windowStart, mode } = await getAtlasWeekly(createAdminClient());
  const shown = charts.filter((c) => c.entries.length > 0);
  const chart = shown.find((c) => requested.success && c.weekStart === requested.data) ?? shown.at(-1);
  return (
    <main className="public-shell">
      <SiteHeader currentPath="/charts/atlas-mongolia" locale={locale} />
      <section className="chart-page-hero">
        <div>
          <p className="eyebrow">{copy.atlasEyebrow}</p>
          <h1>Atlas<br />Top 50</h1>
        </div>
        {chart && (
          <div className="chart-page-hero__issue">
            <span>{chart.status === "final" ? copy.final : copy.provisional}</span>
            <strong>{chart.weekStart.slice(5).replace("-", ".")}–{chart.weekEnd.slice(5).replace("-", ".")}</strong>
            <small>{chart.weekStart.slice(0, 4)}</small>
          </div>
        )}
      </section>
      <section className="chart-page-content">
        <ChartTabs locale={locale} active="atlas" />
        <p className="data-notice">{copy.atlasIntro}</p>
        {shown.length > 1 && (
          <nav className="youtube-tabs" aria-label={copy.week}>
            {shown.map((c) => (
              <Link key={c.weekStart} href={`/charts/atlas-mongolia?week=${c.weekStart}`} aria-current={c.weekStart === chart?.weekStart ? "page" : undefined}>
                {c.weekStart.slice(5)}–{c.weekEnd.slice(5)}
              </Link>
            ))}
          </nav>
        )}
        {!chart || chart.entries.length === 0 ? (
          <p className="workspace-empty">{copy.noAtlas}</p>
        ) : (
          <>
            {chart.status === "provisional" && <p className="data-notice" role="status">{wk.provisional}</p>}
            <AtlasChartTable chart={chart} songs={songs} locale={locale} />
          </>
        )}
        <p className="youtube-meta">{wk.formula}</p>
        <p className="youtube-meta">{wk.sources}</p>
        {mode === "30_day" && <p className="youtube-meta">{wk.retention.replace("{date}", windowStart)}</p>}
      </section>
    </main>
  );
}
