import { ArtistScene } from "@/components/operations/artist-scene";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, BadgeCheck, Link2 } from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { getArtistForReview } from "@/modules/artist-review/repository";
import { getCurrentChartSnapshot } from "@/modules/charts/current";
import { formatUlaanbaatarDate } from "@/modules/charts/format";
import { staffContext } from "@/modules/operations/data";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocale } from "@/modules/i18n/server";
import { ArtistReviewForm } from "./review-form";

export const metadata: Metadata = {
  title: "Review Artist",
};

export const dynamic = "force-dynamic";

type ArtistReviewDetailPageProps = {
  params: Promise<{ artistId: string }>;
};

export default async function ArtistReviewDetailPage({
  params,
}: ArtistReviewDetailPageProps) {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const { artistId } = await params;
  const context = await staffContext();
  const snapshot = await getCurrentChartSnapshot().catch(() => null);
  const dashboard = {
    ...context,
    counts: { signals: 0, anomalies: 0, stories: 0, identityReviews: 0 },
  };

  const artist = await getArtistForReview(snapshot, artistId);
  if (!artist) {
    notFound();
  }

  const canEdit =
    ["administrator", "data_editor"].includes(dashboard.profile.role);
  const currentPath = `/dashboard/artists/${encodeURIComponent(artistId)}`;

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        activeSection="artists"
        counts={dashboard.counts}
        locale={locale}
        profile={dashboard.profile}
      />
      <section className="dashboard-main artist-review-main">
        <DashboardHeader
          title={dictionary.artistReview.reviewTitle}
          eyebrow={dictionary.artistReview.reviewEyebrow}
          status={
            <>
              <span className="freshness__dot" />
              {canEdit
                ? dictionary.artistReview.reviewAccess
                : dictionary.artistReview.readOnlyAccess}
            </>
          }
          currentPath={currentPath}
          locale={locale}
        />

        <section className="artist-review-detail-hero">
          <Link href="/dashboard/artists">
            <ArrowLeft aria-hidden="true" size={15} />
            {dictionary.artistReview.backToQueue}
          </Link>
          <div>
            <span className="artist-review-detail-hero__rank">
              {artist.currentRank ? `№ ${artist.currentRank}` : "—"}
            </span>
            <div>
              <p>{artist.sourceKey ?? dictionary.artistReview.noSourceId}</p>
              <h1>{artist.canonicalName}</h1>
              <span
                className={`artist-review-status artist-review-status--${artist.verification}`}
              >
                {dictionary.artistReview.statuses[artist.verification]}
              </span>
            </div>
          </div>
        </section>

        <div className="workspace-notice artist-review-live-banner">
          <span>{dictionary.artistReview.atomicReview}</span>
          {dictionary.artistReview.atomicReviewBody}
        </div>

        <section className="artist-review-detail-grid">
          <ArtistReviewForm artist={artist} canEdit={canEdit} locale={locale} />

          <aside className="artist-review-context">
            <section>
              <header>
                <BadgeCheck aria-hidden="true" size={17} />
                <h2>{dictionary.artistReview.evidenceHistory}</h2>
                <span>{artist.evidence.length}</span>
              </header>
              {artist.evidence.length > 0 ? (
                <div className="artist-review-evidence-list">
                  {artist.evidence.map((evidence) => (
                    <article key={evidence.id}>
                      <span>
                        {dictionary.artistReview.evidenceTypes[evidence.type]}
                      </span>
                      <strong>
                        {evidence.supportsCountryCode ?? "—"} ·{" "}
                        {evidence.supportsLocality
                          ? dictionary.artistReview.localities[
                              evidence.supportsLocality
                            ]
                          : "—"}
                      </strong>
                      {evidence.notes && <p>{evidence.notes}</p>}
                      <footer>
                        <time>
                          {formatUlaanbaatarDate(evidence.createdAt, locale)}
                        </time>
                        {evidence.sourceUrl && (
                          <a
                            href={evidence.sourceUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {dictionary.artistReview.openEvidence}
                            <ArrowUpRight aria-hidden="true" size={13} />
                          </a>
                        )}
                      </footer>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="artist-review-context__empty">
                  {dictionary.artistReview.noEvidence}
                </p>
              )}
            </section>

            <section>
              <header>
                <Link2 aria-hidden="true" size={17} />
                <h2>{dictionary.artistReview.platformProfiles}</h2>
                <span>{artist.profiles.length}</span>
              </header>
              {artist.profiles.length > 0 ? (
                <div className="artist-review-profile-list">
                  {artist.profiles.map((profile) => (
                    <article key={profile.id}>
                      <div>
                        <strong>{profile.platformName}</strong>
                        <small>{profile.platformArtistId}</small>
                      </div>
                      <span
                        className={`artist-review-status artist-review-status--${profile.matchStatus}`}
                      >
                        {dictionary.artistReview.statuses[profile.matchStatus]}
                      </span>
                      {profile.profileUrl && (
                        <a
                          href={profile.profileUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <ArrowUpRight aria-hidden="true" size={15} />
                          <span className="sr-only">
                            {dictionary.artistReview.openProfile}
                          </span>
                        </a>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="artist-review-context__empty">
                  {dictionary.artistReview.noProfiles}
                </p>
              )}
            </section>
          </aside>
        </section>
        <ArtistScene artistId={artistId} locale={locale} />
      </section>
    </main>
  );
}
