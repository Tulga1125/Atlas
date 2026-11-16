import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight, BadgeCheck } from "lucide-react";
import { SiteHeader } from "@/components/atlas/site-header";
import { ArtistRankHistory } from "@/components/charts/artist-rank-history";
import { getArtistPage, getArtistRedirect } from "@/modules/artists/page-data";
import { formatSnapshotDate } from "@/modules/charts/format";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocale } from "@/modules/i18n/server";
import type { Locale } from "@/modules/i18n/config";

type ArtistPageProps = {
  params: Promise<{ artistId: string }>;
  searchParams: Promise<{ genre?: string; theme?: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ArtistPageProps): Promise<Metadata> {
  const data = await getArtistPage((await params).artistId, await getLocale()).catch(() => null);
  return { title: data?.artist.name ?? "Artist" };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function date(value: string | null, locale: Locale) {
  return value ? formatSnapshotDate(value, locale, { day: "numeric", month: "short", year: "numeric" }) : "—";
}

export default async function ArtistPage({ params, searchParams }: ArtistPageProps) {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const copy = dictionary.artistPage;
  const { artistId } = await params;
  const filter = await searchParams;
  const data = await getArtistPage(artistId, locale);
  if (!data) {
    const target = await getArtistRedirect(artistId);
    if (target) permanentRedirect(`/artists/${target}`);
    notFound();
  }
  const { artist, stats } = data;
  const songs = data.songs.filter(
    (s) =>
      (!filter.genre || s.tags.some((t) => t.dimension === "genre" && t.slug === filter.genre)) &&
      (!filter.theme || s.tags.some((t) => t.dimension === "theme" && t.slug === filter.theme)),
  );
  const path = `/artists/${encodeURIComponent(artistId)}`;

  return (
    <main className="public-shell">
      <SiteHeader currentPath={path} locale={locale} />

      {/* 1. Header */}
      <section className="artist-profile-hero">
        <div className="artist-profile-hero__portrait" style={artist.imageUrl ? { backgroundImage: `url(${artist.imageUrl})` } : undefined}>
          {!artist.imageUrl && <span>{initials(artist.name)}</span>}
        </div>
        <div className="artist-profile-hero__copy">
          <p className="eyebrow">
            <BadgeCheck aria-hidden="true" size={15} />
            {dictionary.artists.detailEyebrow}
          </p>
          <h1>{artist.name}</h1>
          {data.scene.length > 0 && (
            <p className="artist-scene-label">
              {copy.scene}: {data.scene.map((s) => s.label).join(", ")} ·{" "}
              <Link href="/methodology#music-context">{copy.howWeClassify}</Link>
            </p>
          )}
          <p className="artist-profile-hero__biography">{artist.biography ?? dictionary.artists.biographyFallback}</p>
          {artist.profiles.length > 0 && (
            <div className="artist-profiles__links">
              {artist.profiles.map((profile) => (
                <a href={profile.url} key={profile.platformCode} rel="noreferrer" target="_blank">
                  {profile.platformName}
                  <ArrowUpRight aria-hidden="true" size={15} />
                </a>
              ))}
            </div>
          )}
          <Link className="text-link" href="/artists">
            <ArrowLeft aria-hidden="true" size={14} />
            {dictionary.artists.backToArtists}
          </Link>
        </div>
      </section>

      {/* 2. Key statistics */}
      <section className="artist-history">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{dictionary.artists.atlasHistory}</p>
            <h2>{dictionary.artists.peakRank}</h2>
          </div>
          <strong className="artist-history__peak">{stats.peakRank ? `№ ${stats.peakRank}` : "—"}</strong>
        </div>
        <dl className="artist-history__stats">
          <div><dt>{dictionary.artists.songsCharted}</dt><dd>{stats.songsCharted}</dd></div>
          <div><dt>{dictionary.artists.chartingDays}</dt><dd>{stats.chartingDays}</dd></div>
          <div><dt>{dictionary.artists.topTenDays}</dt><dd>{stats.topTenEntryDays}</dd></div>
          <div><dt>{dictionary.artists.numberOneDays}</dt><dd>{stats.numberOneEntryDays}</dd></div>
          <div><dt>{copy.currentSongs}</dt><dd>{stats.currentSongs}</dd></div>
          <div><dt>{copy.chartShare}</dt><dd>{stats.chartShare} / 100 {copy.places}</dd></div>
          <div><dt>{dictionary.artists.firstCharted}</dt><dd>{date(stats.firstChartDate, locale)}</dd></div>
          <div><dt>{dictionary.artists.latestCharted}</dt><dd>{date(stats.latestChartDate, locale)}</dd></div>
        </dl>
      </section>

      {/* 3. Chart history */}
      <section className="editorial-page artist-section">
        <h2>{copy.chartHistory}</h2>
        <p>{copy.chartHistoryHelp}</p>
        {data.songs.some((s) => s.history.length > 0) ? (
          <>
            <ArtistRankHistory
              songs={data.songs}
              milestones={data.milestones.map((m) => ({ date: m.date, rank: m.rank, label: copy.milestoneKinds[m.kind] }))}
              label={copy.chartHistory}
            />
            <h3>{copy.milestones}</h3>
            <ol className="artist-milestones">
              {data.milestones.map((m) => (
                <li key={`${m.date}-${m.kind}-${m.songId}`}>
                  <Link href={`/charts/apple-music-mongolia?date=${m.date}`}>
                    <time>{date(m.date, locale)}</time> · {copy.milestoneKinds[m.kind]} · {m.title} (№{m.rank})
                  </Link>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="artist-panel-empty">{copy.noHistory}</p>
        )}
      </section>

      {/* 4. Sound and subject */}
      <section className="editorial-page artist-section">
        <h2>{copy.profile}</h2>
        <p>
          {copy.profileHelp} <Link href="/methodology#music-context">{copy.howWeClassify}</Link>
        </p>
        <div className="artist-profile-bars">
          {data.profile.map((p) => (
            <article key={p.dimension}>
              <h3>{copy.dimensions[p.dimension]}</h3>
              <p className="artist-profile-bars__basis">
                {copy.basedOn.replace("{tagged}", String(p.tagged)).replace("{total}", String(p.total))}
              </p>
              {p.bars.length === 0 ? (
                <p className="artist-panel-empty">{copy.notTagged.replace("{dimension}", copy.dimensions[p.dimension].toLowerCase())}</p>
              ) : (
                <ul>
                  {p.bars.map((b) => (
                    <li key={b.termId}>
                      <Link href={`${path}?${p.dimension === "genre" ? "genre" : "theme"}=${b.slug}#discography`}>
                        <span>{b.label}</span>
                        <span className="artist-profile-bars__bar" style={{ width: `${Math.min(b.percent, 100)}%` }} />
                        <strong>{b.percent}%</strong>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* 5. Discography */}
      <section className="editorial-page artist-section" id="discography">
        <h2>{copy.discography}</h2>
        {(data.filters.genres.length > 0 || data.filters.themes.length > 0) && (
          <form className="filter-form" action={path}>
            <label>
              {copy.dimensions.genre}
              <select name="genre" defaultValue={filter.genre ?? ""}>
                <option value="">{copy.allGenres}</option>
                {data.filters.genres.map((g) => <option key={g.slug} value={g.slug}>{g.label}</option>)}
              </select>
            </label>
            <label>
              {copy.dimensions.theme}
              <select name="theme" defaultValue={filter.theme ?? ""}>
                <option value="">{copy.allThemes}</option>
                {data.filters.themes.map((t) => <option key={t.slug} value={t.slug}>{t.label}</option>)}
              </select>
            </label>
            <button type="submit">{copy.filter}</button>
          </form>
        )}
        {songs.length === 0 ? (
          <p className="artist-panel-empty">{copy.noSongs}</p>
        ) : (
          <div className="artist-current-songs">
            {songs.map((song) => (
              <div className="artist-discography__row" key={song.id}>
                <Link href={`/songs/${encodeURIComponent(song.id)}`}>
                  <strong>№ {song.currentRank ?? "—"}</strong>
                  <span>
                    {song.title}
                    <small>
                      {copy.peak} № {song.peakRank ?? "—"} · {song.daysOnChart} {copy.days}
                      {song.tags.length > 0 && ` · ${song.tags.filter((t) => t.dimension !== "mood").map((t) => t.label).join(", ")}`}
                    </small>
                  </span>
                </Link>
                {song.links.slice(0, 1).map((l) => (
                  <a key={l.id} href={l.url} rel="noreferrer" target="_blank" aria-label={`${copy.listen}: ${song.title}`}>
                    <ArrowUpRight aria-hidden="true" size={18} />
                  </a>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="artist-intelligence-grid">
        {/* 6. Collaborations */}
        <article className="artist-source-panel">
          <header><p className="eyebrow">{copy.collaborations}</p></header>
          {data.collaborations.length === 0 ? (
            <p className="artist-panel-empty">{copy.noCollaborations}</p>
          ) : (
            <ul className="artist-link-list">
              {data.collaborations.map((c) => (
                <li key={c.artistId}>
                  <Link href={`/artists/${c.artistId}`}>{c.name}</Link>
                  <small>{c.songs.join(", ")}</small>
                </li>
              ))}
            </ul>
          )}
        </article>
        {/* 7. Atlas coverage */}
        <article className="artist-source-panel">
          <header><p className="eyebrow">{copy.coverage}</p></header>
          {data.publications.length === 0 ? (
            <p className="artist-panel-empty">{copy.noCoverage}</p>
          ) : (
            <ul className="artist-link-list">
              {data.publications.map((p) => (
                <li key={p.id}>
                  <Link href={p.channel === "atlas" ? `/news/${p.id}` : (p.external_url ?? `/news/${p.id}`)}>
                    {locale === "en" && p.headline_en ? p.headline_en : p.headline_mn}
                  </Link>
                  <small>{date(p.published_at.slice(0, 10), locale)}</small>
                </li>
              ))}
            </ul>
          )}
        </article>
        {/* 8. Similar artists */}
        <article className="artist-source-panel">
          <header><p className="eyebrow">{copy.similar}</p></header>
          {data.similar.length === 0 ? (
            <p className="artist-panel-empty">{copy.noSimilar}</p>
          ) : (
            <ul className="artist-link-list">
              {data.similar.map((s) => (
                <li key={s.artistId}>
                  <Link href={`/artists/${s.artistId}`}>{s.name}</Link>
                  <small>
                    {copy.similarWhy}: {s.sharedLabels.join(", ")}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      {/* 9. Methodology */}
      <section className="methodology-principle artist-section">
        <strong>{copy.methodology}</strong>
        <p>
          {copy.methodologyBody} <Link href="/methodology">{dictionary.common.methodology} →</Link>
        </p>
      </section>
    </main>
  );
}
