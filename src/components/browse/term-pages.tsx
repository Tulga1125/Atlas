import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/atlas/site-header";
import { getTermIndex, getTermPage, type BrowseSection } from "@/modules/context/browse-data";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocale } from "@/modules/i18n/server";

export async function TermIndexPage({ section }: { section: BrowseSection }) {
  const locale = await getLocale();
  const copy = getDictionary(locale).browse;
  const terms = await getTermIndex(section, locale);
  return (
    <main className="public-shell">
      <SiteHeader currentPath={`/${section}`} locale={locale} />
      <section className="editorial-page">
        <p className="eyebrow">{copy.sections[section]}</p>
        <h1>{copy.sections[section]}</h1>
        <p>
          {copy.indexIntro[section]} <Link href="/methodology#music-context">{copy.howWeClassify} →</Link>
        </p>
        <ul className="browse-terms">
          {terms.map((t) => (
            <li key={t.slug}>
              <Link href={`/${section}/${t.slug}`}>
                <strong>{t.label}</strong>
                <small>
                  {t.onChart} {copy.onChartNow} · {t.tagged} {copy.tagged}
                </small>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

export async function TermDetailPage({ section, slug }: { section: BrowseSection; slug: string }) {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const copy = dictionary.browse;
  const page = await getTermPage(section, slug, locale);
  if (!page) notFound();
  const max = Math.max(1, ...page.history.map((h) => h.songs));
  const path = `/${section}/${slug}`;
  return (
    <main className="public-shell">
      <SiteHeader currentPath={path} locale={locale} />
      <section className="editorial-page">
        <Link className="back-link" href={`/${section}`}>
          ← {copy.sections[section]}
        </Link>
        <p className="eyebrow">{copy.singular[section]}</p>
        <h1>{page.term.label}</h1>
        <p>
          {page.current.length} {copy.onChartNow} · {page.taggedSongs} {copy.tagged}
          {page.weekChange !== null && ` · ${copy.weekChange}: ${page.weekChange > 0 ? "+" : ""}${page.weekChange}`}
        </p>
        <p>
          <Link href={`/charts/apple-music-mongolia?${section === "genres" ? "genre" : section === "themes" ? "theme" : "scene"}=${slug}`}>
            {dictionary.chart.titleLineOne} {dictionary.chart.titleLineTwo} →
          </Link>
        </p>
      </section>

      <section className="artist-intelligence-grid">
        <article className="artist-source-panel">
          <header><p className="eyebrow">{copy.currentSongs}</p></header>
          {!page.chartDate ? (
            <p className="artist-panel-empty">{copy.noChart}</p>
          ) : page.current.length === 0 ? (
            <p className="artist-panel-empty">{copy.noCurrent}</p>
          ) : (
            <ul className="artist-link-list">
              {page.current.map((e) => (
                <li key={e.songId}>
                  <Link href={`/songs/${e.songId}`}>
                    №{e.rank} · {e.title}
                  </Link>
                  <small>{e.artist}</small>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="artist-source-panel">
          <header><p className="eyebrow">{copy.topArtists}</p></header>
          {page.topArtists.length === 0 ? (
            <p className="artist-panel-empty">{copy.noArtists}</p>
          ) : (
            <ul className="artist-link-list">
              {page.topArtists.map((a) => (
                <li key={a.artistId}>
                  <Link href={`/artists/${a.artistId}`}>{a.name}</Link>
                  <small>
                    {a.songs} {copy.songs} · {a.chartDays} {copy.chartDays}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="editorial-page">
        <h2>{copy.history}</h2>
        <p>{copy.historyHelp}</p>
        {page.history.length === 0 ? (
          <p className="artist-panel-empty">{copy.noChart}</p>
        ) : (
          <ol className="browse-history" aria-label={copy.history}>
            {page.history.map((h) => (
              <li key={h.date}>
                <Link href={`/charts/apple-music-mongolia?date=${h.date}`} title={`${h.date}: ${h.songs} ${copy.songs}, ${h.topTen} ${copy.topTen}`}>
                  <span className="browse-history__bar" style={{ height: `${(h.songs / max) * 100}%` }} />
                  <span className="sr-only">
                    {h.date}: {h.songs} {copy.songs}, {h.topTen} {copy.topTen}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
