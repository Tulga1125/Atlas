import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "./site-header";
import { AwaitingChart } from "@/components/charts/awaiting-chart";
import type { ArtistSummary } from "@/modules/artists/types";
import type { Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";

export function DiscoveryHome({ artists, locale }: { artists: ArtistSummary[]; locale: Locale }) {
  const dictionary = getDictionary(locale);
  return (
    <main className="public-shell">
      <SiteHeader currentPath="/" locale={locale} />
      <section className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">{dictionary.home.eyebrow}</p>
          <h1>{dictionary.home.heroLead}<br /><span>{dictionary.home.heroAccent}</span></h1>
          <p className="hero-lede">{locale === "mn" ? "Монголын хөгжмийг эх сурвалжтай нь нээ. Уран бүтээлчидтэй танилцаж, тэдний хөгжмийн замналыг дагаарай." : "Discover the people behind Mongolia’s music. Explore verified artist profiles and the sources behind their stories."}</p>
          <div className="hero-actions">
            <Link className="button button--ink" href="/artists">{dictionary.artists.directoryEyebrow} <ArrowRight aria-hidden="true" size={16} /></Link>
            <Link className="text-link" href="/methodology">{dictionary.home.howItWorks}</Link>
          </div>
        </div>
        <AwaitingChart locale={locale} />
      </section>
      <section className="chart-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{dictionary.artists.verifiedOnly}</p>
            <h2>{locale === "mn" ? "Уран бүтээлчидтэй танилц" : "Meet the artists"}</h2>
          </div>
          <Link className="text-link" href="/artists">{locale === "mn" ? "Бүгдийг харах" : "View directory"} <ArrowRight aria-hidden="true" size={16} /></Link>
        </div>
        {artists.length ? <div className="discovery-grid">
          {artists.slice(0, 6).map(artist => <Link className="discovery-artist" href={`/artists/${artist.id}`} key={artist.id}>
            <span className="discovery-artist__initial" aria-hidden="true">{artist.name.slice(0, 1)}</span>
            <h3>{artist.name}</h3>
            <p>{artist.biography ?? dictionary.artists.biographyFallback}</p>
            <span className="text-link">{dictionary.artists.viewProfile} <ArrowRight aria-hidden="true" size={15} /></span>
          </Link>)}
        </div> : <p>{dictionary.artists.noArtistsBody}</p>}
      </section>
      <footer className="site-footer"><strong>{dictionary.home.footerLead}</strong><p>Atlas Charts · {locale === "mn" ? "Улаанбаатар" : "Ulaanbaatar"}</p></footer>
    </main>
  );
}
