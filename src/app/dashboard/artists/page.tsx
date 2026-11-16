import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeCheck,
  ChevronRight,
  CircleAlert,
  CirclePlay,
  Search,
  ShieldQuestion,
} from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { getArtistReviewQueue } from "@/modules/artist-review/repository";
import type { ArtistReviewFilter } from "@/modules/artist-review/types";
import { getCurrentChartSnapshot } from "@/modules/charts/current";
import { formatUlaanbaatarDate } from "@/modules/charts/format";
import { staffContext } from "@/modules/operations/data";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocale } from "@/modules/i18n/server";

export const metadata: Metadata = {
  title: "Artist Review",
};

export const dynamic = "force-dynamic";

type ArtistReviewPageProps = {
  searchParams: Promise<{ filter?: string; query?: string }>;
};

const reviewFilters: ArtistReviewFilter[] = [
  "needs_review",
  "verified",
  "disputed",
  "all",
];

function parseFilter(value: string | undefined): ArtistReviewFilter {
  return reviewFilters.includes(value as ArtistReviewFilter)
    ? (value as ArtistReviewFilter)
    : "needs_review";
}

export default async function ArtistReviewPage({
  searchParams,
}: ArtistReviewPageProps) {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const context = await staffContext();
  const snapshot = await getCurrentChartSnapshot().catch(() => null);
  const dashboard = {
    ...context,
    counts: { signals: 0, anomalies: 0, stories: 0, identityReviews: 0 },
  };

  const parameters = await searchParams;
  const filter = parseFilter(parameters.filter);
  const query = parameters.query?.trim() ?? "";
  const queue = await getArtistReviewQueue(snapshot, filter, query);
  const canEdit =
    ["administrator", "data_editor"].includes(dashboard.profile.role);
  const counts = {
    ...dashboard.counts,
    identityReviews: queue.counts.needsReview,
  };

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        activeSection="artists"
        counts={counts}
        locale={locale}
        profile={dashboard.profile}
      />
      <section className="dashboard-main artist-review-main">
        <DashboardHeader
          title={dictionary.artistReview.queueTitle}
          eyebrow={dictionary.artistReview.catalogEyebrow}
          status={
            <>
              <span className="freshness__dot" />
              {canEdit
                ? dictionary.artistReview.reviewAccess
                : dictionary.artistReview.readOnlyAccess}
            </>
          }
          currentPath="/dashboard/artists"
          locale={locale}
        />

        <div className="workspace-notice artist-review-live-banner">
          <span>{dictionary.artistReview.liveRegistry}</span>
          {dictionary.artistReview.queueIntro}
        </div>

        <section
          className="artist-review-metrics"
          aria-label={dictionary.artistReview.queueSummary}
        >
          <article>
            <ShieldQuestion aria-hidden="true" />
            <span>{dictionary.artistReview.needsReview}</span>
            <strong>{queue.counts.needsReview}</strong>
          </article>
          <article>
            <BadgeCheck aria-hidden="true" />
            <span>{dictionary.artistReview.verifiedLocal}</span>
            <strong>{queue.counts.verifiedLocal}</strong>
          </article>
          <article>
            <CircleAlert aria-hidden="true" />
            <span>{dictionary.artistReview.disputed}</span>
            <strong>{queue.counts.disputed}</strong>
          </article>
          <article>
            <CirclePlay aria-hidden="true" />
            <span>{dictionary.artistReview.youtubeLinked}</span>
            <strong>{queue.counts.youtubeLinked}</strong>
          </article>
        </section>

        <p className="data-notice">
          <Link href="/dashboard/artists/queue">{dictionary.artistQueue.title} →</Link>
        </p>

        <section className="artist-review-queue">
          <header className="artist-review-toolbar">
            <nav aria-label={dictionary.artistReview.filterLabel}>
              {reviewFilters.map((candidateFilter) => (
                <Link
                  className={filter === candidateFilter ? "active" : ""}
                  href={{
                    pathname: "/dashboard/artists",
                    query: {
                      filter: candidateFilter,
                      ...(query ? { query } : {}),
                    },
                  }}
                  key={candidateFilter}
                >
                  {dictionary.artistReview.filters[candidateFilter]}
                </Link>
              ))}
            </nav>
            <form action="/dashboard/artists" className="artist-review-search">
              <input name="filter" type="hidden" value={filter} />
              <Search aria-hidden="true" size={15} />
              <input
                aria-label={dictionary.artistReview.searchLabel}
                defaultValue={query}
                name="query"
                placeholder={dictionary.artistReview.searchPlaceholder}
              />
              <button type="submit">{dictionary.artistReview.search}</button>
            </form>
          </header>

          {queue.artists.length > 0 ? (
            <div className="artist-review-list">
              {queue.artists.map((artist) => {
                const youtubeLinked = artist.profiles.some(
                  (profile) => profile.platformCode === "youtube",
                );

                return (
                  <Link
                    href={`/dashboard/artists/${encodeURIComponent(artist.id)}`}
                    key={artist.id}
                  >
                    <span className="artist-review-list__rank">
                      {artist.currentRank ? `№ ${artist.currentRank}` : "—"}
                    </span>
                    <span className="artist-review-list__identity">
                      <strong>{artist.canonicalName}</strong>
                      <small>
                        {artist.sourceKey ?? dictionary.artistReview.noSourceId}
                      </small>
                    </span>
                    <span
                      className={`artist-review-status artist-review-status--${artist.verification}`}
                    >
                      {dictionary.artistReview.statuses[artist.verification]}
                    </span>
                    <span className="artist-review-list__locality">
                      {dictionary.artistReview.localities[artist.locality]}
                      <small>
                        {artist.countryCode ?? "—"} · {artist.evidence.length}{" "}
                        {dictionary.artistReview.evidenceShort}
                      </small>
                    </span>
                    <span
                      className={
                        youtubeLinked
                          ? "artist-review-list__youtube linked"
                          : "artist-review-list__youtube"
                      }
                    >
                      <CirclePlay aria-hidden="true" size={16} />
                      {youtubeLinked
                        ? dictionary.artistReview.linked
                        : dictionary.artistReview.notLinked}
                    </span>
                    <time>
                      {formatUlaanbaatarDate(artist.updatedAt, locale)}
                    </time>
                    <ChevronRight aria-hidden="true" size={18} />
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="artist-review-empty">
              <strong>00</strong>
              <div>
                <h2>{dictionary.artistReview.emptyTitle}</h2>
                <p>{dictionary.artistReview.emptyBody}</p>
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
