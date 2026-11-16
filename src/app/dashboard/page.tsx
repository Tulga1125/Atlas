import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
} from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Movement } from "@/components/charts/movement";
import { DashboardHeader } from "@/components/dashboard/header";
import { getCurrentChartSnapshot } from "@/modules/charts/current";
import {
  formatUlaanbaatarDate,
  formatUlaanbaatarTime,
} from "@/modules/charts/format";
import { summarizeChart } from "@/modules/charts/summary";
import {
  getDashboardData,
  StaffAccessError,
} from "@/modules/dashboard/repository";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocale } from "@/modules/i18n/server";
import type { Locale } from "@/modules/i18n/config";

export const metadata: Metadata = {
  title: "Command Center",
};

export const dynamic = "force-dynamic";

function dashboardStatusLabel(status: string, locale: Locale) {
  const readableStatus = status.replaceAll("_", " ");

  if (locale === "en") {
    return readableStatus;
  }

  const mongolianStatuses: Record<string, string> = {
    failed: "амжилтгүй",
    pending: "хүлээгдэж буй",
    recorded: "бүртгэгдсэн",
    running: "ажиллаж буй",
    succeeded: "амжилттай",
  };

  return mongolianStatuses[status] ?? readableStatus;
}

export default async function DashboardPage() {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const snapshot = await getCurrentChartSnapshot().catch(() =>
    redirect("/dashboard/data-health"),
  );
  let dashboard;
  try {
    dashboard = await getDashboardData(snapshot);
  } catch (error) {
    if (
      error instanceof StaffAccessError &&
      (error.code === "unauthenticated" || error.code === "inactive")
    ) {
      redirect("/login?error=access_denied");
    }
    throw error;
  }

  const summary = summarizeChart(snapshot);
  const numberOne = snapshot.entries[0];
  const movers = [...snapshot.entries]
    .filter((entry) => (entry.rankChange ?? 0) > 0)
    .sort((a, b) => (b.rankChange ?? 0) - (a.rankChange ?? 0))
    .slice(0, 4);
  const highestNewEntry = snapshot.entries.find(
    (entry) => entry.entryStatus === "new",
  );
  const localPeaks = snapshot.entries.filter(
    (entry) =>
      entry.rank <= 10 && entry.isLocal && entry.rank === entry.peakRank,
  ).length;
  const collectedTime = formatUlaanbaatarTime(snapshot.collectedAt, locale);
  const jobTime = dashboard.latestJob?.completedAt
    ? formatUlaanbaatarTime(dashboard.latestJob.completedAt, locale)
    : "—";
  const jobHealthy =
    !dashboard.latestJob || dashboard.latestJob.status === "succeeded";
  const calculationHealthy =
    !dashboard.calculationStatus || dashboard.calculationStatus === "succeeded";
  const collectionStatus = dashboard.latestJob?.status
    ? dashboardStatusLabel(dashboard.latestJob.status, locale)
    : dictionary.dashboard.recorded;
  const calculationStatus = dashboard.calculationStatus
    ? dashboardStatusLabel(dashboard.calculationStatus, locale)
    : null;

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        counts={dashboard.counts}
        locale={locale}
        profile={dashboard.profile}
      />
      <section className="dashboard-main">
        <DashboardHeader
          title={dictionary.dashboard.greeting}
          eyebrow={formatUlaanbaatarDate(snapshot.collectedAt, locale)}
          status={
            <>
              <span className="freshness__dot" />
              {dictionary.dashboard.dataCurrent} · {collectedTime}
            </>
          }
          currentPath="/dashboard"
          locale={locale}
        />

        <div className="workspace-notice">
          <span>
            {dictionary.dashboard.liveSnapshot}
          </span>
          {`${dictionary.dashboard.approvedData} ${snapshot.date}.`}
        </div>

        <section
          className="dashboard-metrics"
          aria-label={dictionary.dashboard.dailySummary}
        >
          <article className="dashboard-metric dashboard-metric--feature">
            <span>{dictionary.dashboard.currentNumberOne}</span>
            <strong>{numberOne.title}</strong>
            <small>
              {numberOne.artist} ·{" "}
              {numberOne.rankChange && numberOne.rankChange > 0
                ? `${dictionary.dashboard.up} ${numberOne.rankChange}`
                : dictionary.dashboard.atNumberOne}
            </small>
          </article>
          <article>
            <span>{dictionary.dashboard.newEntries}</span>
            <strong>{summary.newEntries}</strong>
            <small>
              {highestNewEntry
                ? `${dictionary.dashboard.highestAt} ${highestNewEntry.rank}`
                : dictionary.dashboard.noDebuts}
            </small>
          </article>
          <article>
            <span>{dictionary.dashboard.localTopTen}</span>
            <strong>{summary.localEntries}</strong>
            <small>
              {localPeaks} {dictionary.dashboard.atNewPeak}
            </small>
          </article>
          <article>
            <span>{dictionary.dashboard.openAnomalies}</span>
            <strong>{dashboard.counts.anomalies}</strong>
            <small>
              {dashboard.anomalies[0]?.summary ?? dictionary.dashboard.noAlerts}
            </small>
          </article>
        </section>

        <section className="dashboard-grid">
          <article className="dashboard-panel dashboard-panel--chart">
            <header>
              <div>
                <span className="panel-kicker">
                  {dictionary.dashboard.todaysChart}
                </span>
                <h2>{dictionary.dashboard.topTen}</h2>
              </div>
              <Link href="/charts/apple-music-mongolia">
                {dictionary.dashboard.openExplorer}{" "}
                <ArrowRight aria-hidden="true" size={14} />
              </Link>
            </header>
            <div className="dashboard-top-list">
              {snapshot.entries.slice(0, 10).map((entry) => (
                <div key={entry.songId}>
                  <strong>{String(entry.rank).padStart(2, "0")}</strong>
                  <span>
                    {entry.title}
                    <small>{entry.artist}</small>
                  </span>
                  <Movement
                    change={entry.rankChange}
                    locale={locale}
                    status={entry.entryStatus}
                  />
                </div>
              ))}
            </div>
          </article>

          <article className="dashboard-panel dashboard-panel--movers">
            <header>
              <div>
                <span className="panel-kicker">
                  {dictionary.dashboard.movement}
                </span>
                <h2>{dictionary.dashboard.biggestGains}</h2>
              </div>
              <Link
                aria-label={dictionary.dashboard.moreMovement}
                href="/dashboard/charts?sort=movement"
              >
                <ArrowRight aria-hidden="true" size={18} />
              </Link>
            </header>
            <div className="movers-list">
              {movers.map((entry, index) => (
                <div key={entry.songId}>
                  <span className="movers-list__index">0{index + 1}</span>
                  <span className="movers-list__track">
                    <strong>{entry.title}</strong>
                    <small>
                      {entry.artist} · № {entry.rank}
                    </small>
                  </span>
                  <strong className="movers-list__change">
                    +{entry.rankChange}
                  </strong>
                </div>
              ))}
            </div>
          </article>

          <article className="dashboard-panel dashboard-panel--brief">
            <header>
              <div>
                <span className="panel-kicker">
                  {dictionary.dashboard.dailyBrief}
                </span>
                <h2>{dictionary.dashboard.storiesToKnow}</h2>
              </div>
              <span className="panel-count">
                {dashboard.stories.length} {dictionary.dashboard.leads}
              </span>
            </header>
            <div className="brief-list">
              {dashboard.stories.length > 0 ? (
                dashboard.stories.slice(0, 3).map((story) => (
                  <div className="brief-item" key={story.id}>
                    <span
                      className={`priority ${story.priority === "urgent" ? "priority--urgent" : story.priority === "high" ? "priority--high" : ""}`}
                    >
                      {story.priority === "normal"
                        ? dictionary.dashboard.watch
                        : dictionary.dashboard.priorities[story.priority]}
                    </span>
                    <span>
                      <strong>{story.headline}</strong>
                      <small>{story.detail}</small>
                    </span>
                    <ChevronRight aria-hidden="true" size={18} />
                  </div>
                ))
              ) : (
                <p className="dashboard-empty">
                  {dictionary.dashboard.noStories}
                </p>
              )}
            </div>
          </article>

          <article className="dashboard-panel dashboard-panel--health">
            <header>
              <div>
                <span className="panel-kicker">
                  {dictionary.dashboard.operations}
                </span>
                <h2>{dictionary.dashboard.dataHealth}</h2>
              </div>
              <CheckCircle2 aria-hidden="true" className="health-good" />
            </header>
            <ul className="health-list">
              <li className={jobHealthy ? "" : "health-warning"}>
                {jobHealthy ? (
                  <CheckCircle2 aria-hidden="true" />
                ) : (
                  <CircleAlert aria-hidden="true" />
                )}
                <span>
                  {dictionary.dashboard.collection} {collectionStatus}
                  <small>
                    {dashboard.latestJob?.itemsReceived ?? snapshot.entryCount}{" "}
                    {dictionary.dashboard.of} {snapshot.entryCount}{" "}
                    {dictionary.dashboard.entries}
                  </small>
                </span>
                <time>{jobTime === "—" ? collectedTime : jobTime}</time>
              </li>
              <li>
                <CheckCircle2 aria-hidden="true" />
                <span>
                  {dictionary.dashboard.rankValid}
                  <small>{dictionary.dashboard.noGaps}</small>
                </span>
                <time>{collectedTime}</time>
              </li>
              <li
                className={
                  dashboard.openIdentityReviews > 0 ? "health-warning" : ""
                }
              >
                {dashboard.openIdentityReviews > 0 ? (
                  <Clock3 aria-hidden="true" />
                ) : (
                  <CheckCircle2 aria-hidden="true" />
                )}
                <span>
                  {dictionary.dashboard.identityReview}
                  <small>
                    {dashboard.openIdentityReviews}{" "}
                    {dictionary.dashboard.suggestedMatches}
                  </small>
                </span>
                <time>
                  {dashboard.openIdentityReviews > 0
                    ? dictionary.dashboard.open
                    : dictionary.dashboard.clear}
                </time>
              </li>
              <li className={calculationHealthy ? "" : "health-warning"}>
                {calculationHealthy ? (
                  <CheckCircle2 aria-hidden="true" />
                ) : (
                  <CircleAlert aria-hidden="true" />
                )}
                <span>
                  {dictionary.dashboard.calculationRun}
                  <small>
                    {calculationStatus ?? dictionary.dashboard.calculatedInline}
                  </small>
                </span>
                <time>{calculationStatus ?? dictionary.dashboard.inline}</time>
              </li>
            </ul>
          </article>
        </section>
      </section>
    </main>
  );
}
