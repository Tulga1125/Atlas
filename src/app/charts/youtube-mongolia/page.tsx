import type { Metadata } from "next";
import { z } from "zod";
import { SiteHeader } from "@/components/atlas/site-header";
import { ChartTabs } from "@/components/charts/chart-tabs";
import { YouTubeChartTable } from "@/components/charts/public-charts";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTrackedChart, getTrackedDates } from "@/modules/youtube/surface-data";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocale } from "@/modules/i18n/server";

export const metadata: Metadata = { title: "YouTube Mongolia Top 100" };
export const dynamic = "force-dynamic";

// Public YouTube chart (owner, 2026-11-17): Mongolian songs by daily YouTube
// views gained. Never shows a date outside the YouTube retention window.
export default async function YouTubeMongoliaChart({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const copy = dictionary.charts;
  const requested = z.iso.date().safeParse((await searchParams).date);
  const db = createAdminClient();
  const [chart, dates] = await Promise.all([getTrackedChart(db, requested.success ? requested.data : undefined), getTrackedDates(db)]);
  return (
    <main className="public-shell">
      <SiteHeader currentPath="/charts/youtube-mongolia" locale={locale} />
      <section className="chart-page-hero">
        <div>
          <p className="eyebrow">{copy.youtubeEyebrow}</p>
          <h1>YouTube<br />Top 100</h1>
        </div>
        {chart.date && !chart.expired && (
          <div className="chart-page-hero__issue">
            <span>{copy.asOf}</span>
            <strong>{chart.date}</strong>
          </div>
        )}
      </section>
      <section className="chart-page-content">
        <ChartTabs locale={locale} active="youtube" />
        <p className="data-notice">{copy.youtubeIntro}</p>
        {dates.length > 1 && (
          <form className="archive-date-form" method="get">
            <label htmlFor="yt-date">{copy.asOf}</label>
            <select id="yt-date" name="date" defaultValue={chart.date ?? undefined}>
              {dates.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <button type="submit">{dictionary.chart.load}</button>
          </form>
        )}
        {chart.expired || chart.entries.length === 0 ? (
          <p className="workspace-empty">{copy.noYouTube}</p>
        ) : (
          <YouTubeChartTable entries={chart.entries} locale={locale} />
        )}
        <p className="youtube-meta">{dictionary.publicYouTube.note}</p>
      </section>
    </main>
  );
}
