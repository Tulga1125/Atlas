import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Download, Info } from "lucide-react";
import { z } from "zod";
import { SiteHeader } from "@/components/atlas/site-header";
import { ChartTable } from "@/components/charts/chart-table";
import { AwaitingChart } from "@/components/charts/awaiting-chart";
import { getCurrentChartSnapshot } from "@/modules/charts/current";
import { formatSnapshotDate } from "@/modules/charts/format";
import { ChartDataError } from "@/modules/charts/repository";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocale } from "@/modules/i18n/server";
import { termFilterFrom } from "@/modules/context/browse-data";
import { TermFilterForm } from "@/components/browse/term-filter";

export const metadata: Metadata = {
  title: "Apple Music Top 100: Mongolia",
};

export const dynamic = "force-dynamic";

type ChartPageProps = {
  searchParams: Promise<{ date?: string | string[]; genre?: string; theme?: string; scene?: string }>;
};

export default async function AppleMusicMongoliaChartPage({
  searchParams,
}: ChartPageProps) {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const parameters = await searchParams;
  const requestedDate =
    typeof parameters.date === "string" &&
    z.iso.date().safeParse(parameters.date).success
      ? parameters.date
      : undefined;

  let snapshot;
  try {
    snapshot = await getCurrentChartSnapshot(requestedDate);
  } catch (error) {
    if (error instanceof ChartDataError && error.code === "not_found") {
      if (requestedDate) notFound();
      return <main className="public-shell">
        <SiteHeader currentPath="/charts/apple-music-mongolia" locale={locale} />
        <section className="chart-page-hero"><div><p className="eyebrow">{dictionary.chart.eyebrow}</p><h1>{dictionary.chart.titleLineOne}<br />{dictionary.chart.titleLineTwo}</h1></div></section>
        <AwaitingChart locale={locale} />
      </main>;
    }
    throw error;
  }

  const filter = await termFilterFrom(parameters, locale);
  const entries = filter ? snapshot.entries.filter((e) => filter.songIds.has(e.songId)) : snapshot.entries;
  const formattedDate = formatSnapshotDate(snapshot.date, locale);
  const exportUrl = `/api/public/charts/apple-music-mongolia/latest.csv?date=${snapshot.date}`;
  const currentPath = requestedDate
    ? `/charts/apple-music-mongolia?date=${requestedDate}`
    : "/charts/apple-music-mongolia";

  return (
    <main className="public-shell">
      <SiteHeader currentPath={currentPath} locale={locale} />
      <section className="chart-page-hero">
        <div>
          <Link className="back-link" href="/">
            <ArrowLeft aria-hidden="true" size={14} /> {dictionary.common.home}
          </Link>
          <p className="eyebrow">{dictionary.chart.eyebrow}</p>
          <h1>
            {dictionary.chart.titleLineOne}
            <br />
            {dictionary.chart.titleLineTwo}
          </h1>
        </div>
        <div className="chart-page-hero__issue">
          <span>{dictionary.chart.daily}</span>
          <strong>{snapshot.date}</strong>
          <small>{formattedDate}</small>
        </div>
      </section>

      <section className="chart-toolbar" aria-label={dictionary.chart.controls}>
        <form className="archive-date-form" method="get">
          <CalendarDays aria-hidden="true" size={15} />
          <label htmlFor="chart-date">{dictionary.chart.archiveDate}</label>
          <input
            defaultValue={snapshot.date}
            id="chart-date"
            name="date"
            type="date"
          />
          <button type="submit">{dictionary.chart.load}</button>
        </form>
        <div>
          <span className="source-badge">{dictionary.chart.sourceBadge}</span>
          <a href={exportUrl} download>
            <Download aria-hidden="true" size={15} />{" "}
            {dictionary.chart.exportCsv}
          </a>
        </div>
      </section>

      <Link href="/charts/apple-music-mongolia/archive">
        {locale === "mn" ? "Архив" : "Browse archive"} →
      </Link>
      <section className="chart-page-content">
        <div className="data-notice">
          <Info aria-hidden="true" size={18} />
          <p>
                <strong>{dictionary.chart.approvedTitle}</strong>{" "}
                {dictionary.chart.approvedBodyPrefix} {formattedDate};{" "}
                {dictionary.chart.approvedBodySuffix}
          </p>
        </div>
        {snapshot.calculationPending && (
          <p className="data-notice" role="status">
            {locale === "mn"
              ? "Байрууд баталгаажсан. Түүхийн үзүүлэлтүүдийг тооцоолж байна."
              : "Ranks are approved. Historical metrics are being calculated."}
          </p>
        )}
        <TermFilterForm action="/charts/apple-music-mongolia" locale={locale} active={filter} keep={requestedDate ? { date: requestedDate } : {}} />
        <ChartTable entries={entries} locale={locale} />
      </section>
    </main>
  );
}
