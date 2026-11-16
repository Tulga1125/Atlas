import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { SiteHeader } from "@/components/atlas/site-header";
import { RankHistory } from "@/components/charts/rank-history";
import { getSongHistory } from "@/modules/charts/history";
import { getLocale } from "@/modules/i18n/server";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getSongContext } from "@/modules/artists/page-data";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ songId: string }>;
}) {
  const song = await getSongHistory((await params).songId);
  return { title: song?.title ?? "Song history" };
}
export default async function SongPage({
  params,
}: {
  params: Promise<{ songId: string }>;
}) {
  const { songId } = await params,
    locale = await getLocale(),
    dictionary = getDictionary(locale),
    song = await getSongHistory(songId);
  if (!song) notFound();
  if (song.redirectTo) permanentRedirect(`/songs/${song.redirectTo}`);
  const context = await getSongContext(songId, locale);
  const copy = dictionary.artistPage;
  const byDimension = (d: string) => context.tags.filter((t) => t.dimension === d).map((t) => t.label);
  return (
    <main className="public-shell">
      <SiteHeader currentPath={`/songs/${songId}`} locale={locale} />
      <section className="song-hero">
        <div className="song-hero__rank">
          {song.currentRank ? `№ ${song.currentRank}` : "—"}
        </div>
        <div>
          <p className="eyebrow">
            {dictionary.song.eyebrow} ·{" "}
            {dictionary.common.live}
          </p>
          <h1>{song.title}</h1>
          <p>{song.artist}</p>
        </div>
      </section>
      <section className="song-stats">
        <article>
          <span>{dictionary.song.current}</span>
          <strong>{song.currentRank ?? "—"}</strong>
        </article>
        <article>
          <span>{dictionary.song.peak}</span>
          <strong>{song.peakRank ?? "—"}</strong>
        </article>
        <article>
          <span>{dictionary.song.daysCharting}</span>
          <strong>{song.daysOnChart}</strong>
        </article>
      </section>
      <section className="editorial-page song-context">
        <dl className="artist-history__stats">
          {(["genre", "theme", "mood"] as const).map((d) => (
            <div key={d}>
              <dt>{copy.dimensions[d]}</dt>
              <dd>{byDimension(d).join(", ") || "—"}</dd>
            </div>
          ))}
          {context.scenes.map((s) => (
            <div key={s.artistId}>
              <dt>
                {copy.scene} · {s.artist}
              </dt>
              <dd>{s.scenes.join(", ") || "—"}</dd>
            </div>
          ))}
        </dl>
        <p>
          <Link href="/methodology#music-context">{copy.howWeClassify} →</Link>
        </p>
        {context.related.length > 0 && (
          <>
            <h2>{copy.relatedSongs}</h2>
            <ul className="artist-link-list">
              {context.related.map((r) => (
                <li key={r.songId}>
                  <Link href={`/songs/${r.songId}`}>{r.title}</Link>
                </li>
              ))}
            </ul>
          </>
        )}
        {context.publications.length > 0 && (
          <>
            <h2>{copy.coverage}</h2>
            <ul className="artist-link-list">
              {context.publications.map((p) => (
                <li key={p.id}>
                  <Link href={`/news/${p.id}`}>{locale === "en" && p.headline_en ? p.headline_en : p.headline_mn}</Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section className="editorial-page">
        <RankHistory
          history={song.history}
          label={
            locale === "mn"
              ? "Баталгаажсан агшны байр"
              : "Rank in approved snapshots"
          }
        />
        <details>
          <summary>{locale === "mn" ? "Чартын түүх" : "Chart history"}</summary>
          <div className="operations-list">
            {song.history.map((h) => (
              <Link
                href={`/charts/apple-music-mongolia?date=${h.date}`}
                key={h.date}
              >
                {h.date} · № {h.rank}
              </Link>
            ))}
          </div>
        </details>
        {song.aliases.length > 0 && <p>{song.aliases.join(" · ")}</p>}
        <h2>{locale === "mn" ? "Эх сурвалжууд" : "Source assets"}</h2>
        {song.assets.map((a) => (
          <p key={a.id}>
            {a.platform_url ? (
              <a href={a.platform_url} rel="noreferrer">
                {a.platform_title} ↗
              </a>
            ) : (
              a.platform_title
            )}
          </p>
        ))}
      </section>
    </main>
  );
}
