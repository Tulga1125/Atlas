import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck } from "lucide-react";
import { SiteHeader } from "@/components/atlas/site-header";
import { getArtistDirectory } from "@/modules/artists/current";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocale } from "@/modules/i18n/server";

export const metadata: Metadata = {
  title: "Mongolian Artists",
};

export const dynamic = "force-dynamic";

function artistInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default async function ArtistsPage() {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const artists = await getArtistDirectory();

  return (
    <main className="public-shell">
      <SiteHeader currentPath="/artists" locale={locale} />

      <section className="artists-hero">
        <div>
          <p className="eyebrow">{dictionary.artists.directoryEyebrow}</p>
          <h1>
            {dictionary.artists.heroLead}
            <br />
            <span>{dictionary.artists.heroAccent}</span>
          </h1>
        </div>
        <div className="artists-hero__copy">
          <p>{dictionary.artists.intro}</p>
          <span>
            <BadgeCheck aria-hidden="true" size={17} />
            {dictionary.artists.verifiedOnly}
          </span>
        </div>
      </section>

      <section className="artist-directory">
        <div className="artist-notice">
          <strong>
            {dictionary.common.live}
          </strong>
          <p>
            {dictionary.artists.liveNotice}
          </p>
        </div>

        {artists.length > 0 ? (
          <div className="artist-grid">
            {artists.map((artist, index) => (
              <Link
                className="artist-card"
                href={`/artists/${encodeURIComponent(artist.id)}`}
                key={artist.id}
              >
                <div
                  className={`artist-card__portrait artist-card__portrait--${(index % 3) + 1}`}
                  style={
                    artist.imageUrl
                      ? { backgroundImage: `url(${artist.imageUrl})` }
                      : undefined
                  }
                >
                  {!artist.imageUrl && <span>{artistInitials(artist.name)}</span>}
                  {artist.currentBestRank && (
                    <strong>№ {artist.currentBestRank}</strong>
                  )}
                </div>
                <div className="artist-card__body">
                  <span className="artist-card__index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2>{artist.name}</h2>
                  <dl>
                    <div>
                      <dt>{dictionary.artists.peakRank}</dt>
                      <dd>{artist.stats.peakRank ? `№ ${artist.stats.peakRank}` : "—"}</dd>
                    </div>
                    <div>
                      <dt>{dictionary.artists.songsCharted}</dt>
                      <dd>{artist.stats.songsCharted}</dd>
                    </div>
                    <div>
                      <dt>{dictionary.artists.chartingDays}</dt>
                      <dd>{artist.stats.chartingDays}</dd>
                    </div>
                  </dl>
                  <span className="artist-card__link">
                    {dictionary.artists.viewProfile}
                    <ArrowRight aria-hidden="true" size={15} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="artist-empty">
            <span>00</span>
            <div>
              <h2>{dictionary.artists.noArtistsTitle}</h2>
              <p>{dictionary.artists.noArtistsBody}</p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
