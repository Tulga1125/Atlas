import Link from "next/link";
import { ArrowRight, Clock3, Radio, ShieldCheck } from "lucide-react";
import { ChartTable } from "@/components/charts/chart-table";
import { SiteHeader } from "@/components/atlas/site-header";
import { getOptionalChartSnapshot } from "@/modules/charts/current";
import { getArtistDirectory } from "@/modules/artists/current";
import { DiscoveryHome } from "@/components/atlas/discovery-home";
import { formatCompactDate, formatUlaanbaatarTime } from "@/modules/charts/format";
import { summarizeChart } from "@/modules/charts/summary";
import { mongolianView } from "@/modules/charts/mongolian";
import { AtlasChartTable, YouTubeChartTable } from "@/components/charts/public-charts";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAtlasWeekly } from "@/modules/charts/atlas-weekly-data";
import { getTrackedChart } from "@/modules/youtube/surface-data";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocale } from "@/modules/i18n/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const snapshot = await getOptionalChartSnapshot();
  if (!snapshot) return <DiscoveryHome artists={await getArtistDirectory()} locale={locale} />;
  const summary = summarizeChart(snapshot);
  const mongolian = mongolianView(snapshot.entries);
  // The Atlas chart leads (owner, 2026-11-17); YouTube and Apple follow.
  const admin = createAdminClient();
  const [weekly, youtube] = await Promise.all([
    getAtlasWeekly(admin).catch(() => null),
    getTrackedChart(admin).catch(() => null),
  ]);
  const atlas = weekly?.charts.filter((c) => c.entries.length > 0).at(-1) ?? null;
  const atlasOne = atlas?.entries[0] ? { ...weekly!.songs.get(atlas.entries[0].songId), rank: atlas.entries[0].rank } : null;
  const numberOne = atlasOne
    ? { title: atlasOne.title ?? "", artist: atlasOne.artist ?? "", label: atlas!.weekStart.slice(5).replace("-", ".") + "–" + atlas!.weekEnd.slice(5).replace("-", ".") }
    : mongolian[0] ? { title: mongolian[0].title, artist: mongolian[0].artist, label: `Top 100 №${mongolian[0].rank}` } : null;
  const charts = dictionary.charts;
  const collectedTime = formatUlaanbaatarTime(snapshot.collectedAt, locale);

  return (
    <main className="public-shell">
      <SiteHeader currentPath="/" locale={locale} />

      <section className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">{dictionary.home.eyebrow}</p>
          <h1>
            {dictionary.home.heroLead}
            <br />
            <span>{dictionary.home.heroAccent}</span>
          </h1>
          <p className="hero-lede">{dictionary.home.lede}</p>
          <div className="hero-actions">
            <Link className="button button--ink" href="/charts/atlas-mongolia">
              {dictionary.home.viewChart} <ArrowRight aria-hidden="true" size={16} />
            </Link>
            <Link className="text-link" href="/methodology">
              {dictionary.home.howItWorks}
            </Link>
          </div>
        </div>

        <article className="number-one-card">
          <div className="number-one-card__meta">
            <span>№ 001{numberOne ? ` · ${numberOne.label}` : ""}</span>
            <span>{formatCompactDate(snapshot.date)}</span>
          </div>
          <div className="number-one-card__art" aria-hidden="true">
            <span className="pulse-line" />
            <span className="number-one-card__a">a</span>
          </div>
          <div className="number-one-card__copy">
            <p>{dictionary.home.todayNumberOne}</p>
            <h2>{numberOne?.title ?? "—"}</h2>
            <span>{numberOne?.artist ?? dictionary.chart.noMongolian}</span>
          </div>
        </article>
      </section>

      <section className="signal-strip" aria-label={dictionary.home.chartSummary}>
        <article>
          <strong>{summary.newEntries}</strong>
          <span>{dictionary.home.newEntries}</span>
        </article>
        <article>
          <strong>+{summary.biggestGainer?.rankChange ?? 0}</strong>
          <span>{dictionary.home.biggestMove}</span>
        </article>
        <article>
          <strong>{summary.localEntries}</strong>
          <span>{dictionary.home.localTopTen}</span>
        </article>
        <article>
          <strong>{snapshot.entryCount}</strong>
          <span>{dictionary.home.entriesChecked}</span>
        </article>
      </section>

      <section className="chart-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{dictionary.home.hotNow}</p>
            <h2>{dictionary.home.todayTopTen}</h2>
          </div>
          <div className="freshness">
            <span className="freshness__dot" />
            {dictionary.home.updated} {collectedTime} · UB
          </div>
        </div>
        {atlas && weekly ? (
          <AtlasChartTable chart={atlas} songs={weekly.songs} locale={locale} limit={10} />
        ) : (
          <ChartTable entries={mongolian} limit={10} locale={locale} />
        )}
        <div className="section-footer">
          <p>
            {`${dictionary.home.approvedNotice} · ${snapshot.date}`}
          </p>
          <Link className="button button--red" href="/charts/atlas-mongolia">
            {dictionary.home.exploreChart} <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </div>
      </section>

      <section className="chart-section home-daily-charts" aria-label={charts.alsoCharts}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">{charts.alsoCharts}</p>
            <h2>YouTube · Apple Music</h2>
          </div>
        </div>
        <div className="home-daily-charts__grid">
          <article>
            <h3>
              <Link href="/charts/youtube-mongolia">{charts.youtubeTitle} →</Link>
            </h3>
            {youtube && youtube.entries.length > 0 ? (
              <YouTubeChartTable entries={youtube.entries} locale={locale} limit={5} />
            ) : (
              <p className="workspace-empty">{charts.noYouTube}</p>
            )}
          </article>
          <article>
            <h3>
              <Link href="/charts/apple-music-mongolia">{charts.appleTitle} →</Link>
            </h3>
            <ChartTable entries={mongolian} limit={5} locale={locale} />
          </article>
        </div>
      </section>

      <section className="trust-grid">
        <article className="trust-grid__lead">
          <p className="eyebrow">{dictionary.home.trustEyebrow}</p>
          <h2>{dictionary.home.trustTitle}</h2>
          <p>{dictionary.home.trustBody}</p>
        </article>
        <article>
          <Clock3 aria-hidden="true" />
          <h3>{dictionary.home.archiveTitle}</h3>
          <p>{dictionary.home.archiveBody}</p>
        </article>
        <article>
          <ShieldCheck aria-hidden="true" />
          <h3>{dictionary.home.evidenceTitle}</h3>
          <p>{dictionary.home.evidenceBody}</p>
        </article>
        <article>
          <Radio aria-hidden="true" />
          <h3>{dictionary.home.sourceTitle}</h3>
          <p>{dictionary.home.sourceBody}</p>
        </article>
      </section>

      <footer className="site-footer">
        <div>
          <strong>{dictionary.home.footerLead}</strong>
          <span>47.92°N · 106.92°E</span>
        </div>
        <p>Atlas Charts · {locale === "mn" ? "Улаанбаатар" : "Ulaanbaatar"} · Est. 2026</p>
      </footer>
    </main>
  );
}
