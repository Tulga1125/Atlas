import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, BadgeCheck } from "lucide-react";
import { SiteHeader } from "@/components/atlas/site-header";
import { getArtistById } from "@/modules/artists/current";
import { formatSnapshotDate } from "@/modules/charts/format";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocale } from "@/modules/i18n/server";
import type { Locale } from "@/modules/i18n/config";

type ArtistPageProps = {
  params: Promise<{ artistId: string }>;
};

export const dynamic = "force-dynamic";

function artistInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatMetric(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "mn" ? "mn-MN" : "en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function ArtistPage({ params }: ArtistPageProps) {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const { artistId } = await params;
  const artist = await getArtistById(artistId);

  if (!artist) {
    notFound();
  }

  return (
    <main className="public-shell">
      <SiteHeader
        currentPath={`/artists/${encodeURIComponent(artistId)}`}
        locale={locale}
      />

      <section className="artist-profile-hero">
        <div
          className="artist-profile-hero__portrait"
          style={
            artist.imageUrl
              ? { backgroundImage: `url(${artist.imageUrl})` }
              : undefined
          }
        >
          {!artist.imageUrl && <span>{artistInitials(artist.name)}</span>}
        </div>
        <div className="artist-profile-hero__copy">
          <p className="eyebrow">
            <BadgeCheck aria-hidden="true" size={15} />
            {dictionary.artists.detailEyebrow}
          </p>
          <h1>{artist.name}</h1>
          {artist.genres.length > 0 && (
            <div className="artist-profile-hero__genres">
              {artist.genres.map((genre) => (
                <span key={genre}>{genre}</span>
              ))}
            </div>
          )}
          <p className="artist-profile-hero__biography">
            {artist.biography ?? dictionary.artists.biographyFallback}
          </p>
          <Link className="text-link" href="/artists">
            <ArrowLeft aria-hidden="true" size={14} />
            {dictionary.artists.backToArtists}
          </Link>
        </div>
      </section>

      <section className="artist-history">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{dictionary.artists.atlasHistory}</p>
            <h2>{dictionary.artists.peakRank}</h2>
          </div>
          <strong className="artist-history__peak">
            {artist.stats.peakRank ? `№ ${artist.stats.peakRank}` : "—"}
          </strong>
        </div>
        <dl className="artist-history__stats">
          <div>
            <dt>{dictionary.artists.songsCharted}</dt>
            <dd>{artist.stats.songsCharted}</dd>
          </div>
          <div>
            <dt>{dictionary.artists.chartingDays}</dt>
            <dd>{artist.stats.chartingDays}</dd>
          </div>
          <div>
            <dt>{dictionary.artists.topTenDays}</dt>
            <dd>{artist.stats.topTenEntryDays}</dd>
          </div>
          <div>
            <dt>{dictionary.artists.numberOneDays}</dt>
            <dd>{artist.stats.numberOneEntryDays}</dd>
          </div>
          <div>
            <dt>{dictionary.artists.firstCharted}</dt>
            <dd>
              {artist.stats.firstChartDate
                ? formatSnapshotDate(artist.stats.firstChartDate, locale, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "—"}
            </dd>
          </div>
          <div>
            <dt>{dictionary.artists.latestCharted}</dt>
            <dd>
              {artist.stats.latestChartDate
                ? formatSnapshotDate(artist.stats.latestChartDate, locale, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="artist-intelligence-grid">
        <article className="artist-source-panel">
          <header>
            <p className="eyebrow">{dictionary.artists.sourceMetrics}</p>
            <p>{dictionary.artists.metricsExplanation}</p>
          </header>
          {artist.metrics.length > 0 ? (
            <div className="artist-metrics-list">
              {artist.metrics.map((metric) => (
                <div
                  key={`${metric.platformCode}-${metric.name}-${metric.scope}`}
                >
                  <span>{dictionary.artists.metricNames[metric.name]}</span>
                  <strong>{formatMetric(metric.value, locale)}</strong>
                  <small>
                    {dictionary.artists.observed}{" "}
                    {formatSnapshotDate(metric.metricDate, locale)}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <p className="artist-panel-empty">{dictionary.artists.noMetrics}</p>
          )}
        </article>

        <article className="artist-source-panel artist-source-panel--songs">
          <header>
            <p className="eyebrow">
              {locale === "mn" ? "Чартын дуунууд" : "Chart discography"}
            </p>
          </header>
          {artist.currentSongs.length > 0 ? (
            <div className="artist-current-songs">
              {artist.currentSongs.map((song) => (
                <Link
                  href={`/songs/${encodeURIComponent(song.id)}`}
                  key={song.id}
                >
                  <strong>№ {song.currentRank ?? "—"}</strong>
                  <span>
                    {song.title}
                    <small>
                      {dictionary.artists.peakRank} № {song.peakRank} ·{" "}
                      {song.daysOnChart} {dictionary.artists.days}
                    </small>
                  </span>
                  <ArrowUpRight aria-hidden="true" size={18} />
                </Link>
              ))}
            </div>
          ) : (
            <p className="artist-panel-empty">
              {dictionary.artists.noCurrentSongs}
            </p>
          )}
        </article>
      </section>

      <section className="artist-profiles">
        <div>
          <p className="eyebrow">{dictionary.artists.verifiedProfiles}</p>
          <p>{dictionary.artists.sourcePolicy}</p>
        </div>
        <div className="artist-profiles__links">
          {artist.profiles.map((profile) => (
            <a
              href={profile.url}
              key={profile.platformCode}
              rel="noreferrer"
              target="_blank"
            >
              {profile.platformName}
              <ArrowUpRight aria-hidden="true" size={15} />
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
