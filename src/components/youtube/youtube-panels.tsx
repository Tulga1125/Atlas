import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getDictionary } from "@/modules/i18n/dictionaries";
import type { Locale } from "@/modules/i18n/config";
import {
  getArtistYouTube,
  getSongYouTube,
  getTrackedChart,
  getTrackedDates,
  getYouTubeCoverage,
} from "@/modules/youtube/surface-data";
import { coverageShare } from "@/modules/youtube/surfaces";
import { videoUrl } from "@/modules/youtube/video";

// A7 dashboard surfaces (D3: dashboard only). Every figure shows its as-of
// date and the YouTube attribution; nothing older than the retention window.

type Db = SupabaseClient<Database>;
type Copy = ReturnType<typeof getDictionary>["youtubeIntel"];

const fmt = (locale: Locale) => new Intl.NumberFormat(locale === "mn" ? "mn-MN" : "en-US");
const signed = (n: number | null) => (n === null ? "—" : n > 0 ? `+${n}` : String(n));

function Attribution({ copy, asOf, start }: { copy: Copy; asOf: string | null; start: string }) {
  return (
    <p className="youtube-meta">
      {copy.attribution}
      {asOf && ` · ${copy.asOf} ${asOf}`} · {copy.window} {start}
    </p>
  );
}

export function ChartSourceTabs({ locale, active }: { locale: Locale; active: "apple" | "youtube" }) {
  const copy = getDictionary(locale).youtubeIntel;
  return (
    <nav className="youtube-tabs" aria-label="Chart source">
      <Link href="/dashboard/charts" aria-current={active === "apple" ? "page" : undefined}>{copy.tabApple}</Link>
      <Link href="/dashboard/charts?source=youtube" aria-current={active === "youtube" ? "page" : undefined}>{copy.tabYouTube}</Link>
    </nav>
  );
}

export async function YouTubeTrackedChart({ db, locale, date }: { db: Db; locale: Locale; date?: string }) {
  const copy = getDictionary(locale).youtubeIntel;
  const [chart, dates] = await Promise.all([getTrackedChart(db, date), getTrackedDates(db)]);
  const n = fmt(locale);
  return (
    <section className="youtube-chart" aria-labelledby="youtube-chart-title">
      <h2 id="youtube-chart-title">{copy.chartTitle}</h2>
      <p className="data-notice">{copy.chartNote}</p>
      {dates.length > 0 && (
        <form className="filter-form">
          <input type="hidden" name="source" value="youtube" />
          <label>
            {copy.asOf}
            <select name="date" defaultValue={chart.date ?? undefined}>
              {dates.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <button>{copy.asOf}</button>
          {chart.date && !chart.expired && (
            <a className="youtube-csv" href={`/api/v1/youtube/tracked-chart.csv?date=${chart.date}`}>{copy.csv}</a>
          )}
        </form>
      )}
      <Attribution copy={copy} asOf={chart.expired ? null : chart.date} start={chart.windowStart} />
      {chart.expired ? (
        <p className="workspace-empty">{copy.expired}</p>
      ) : chart.entries.length === 0 ? (
        <p className="workspace-empty">{copy.noData}</p>
      ) : (
        <div className="table-scroll">
          <table className="operations-table">
            <thead>
              <tr>
                <th>{copy.rank}</th>
                <th>{copy.change}</th>
                <th>{copy.song}</th>
                <th>{copy.artist}</th>
                <th>{copy.gained}</th>
                <th>{copy.peak}</th>
                <th>{copy.days}</th>
                <th>{copy.momentum}</th>
              </tr>
            </thead>
            <tbody>
              {chart.entries.map((e) => (
                <tr key={e.song_id}>
                  <td>{e.rank}</td>
                  <td>{e.previous_rank === null ? (locale === "mn" ? "Шинэ" : "New") : signed(e.rank_change)}</td>
                  <td><Link href={`/dashboard/catalog/${e.song_id}`}>{e.title}</Link></td>
                  <td>{e.artistId ? <Link href={`/dashboard/artists/${e.artistId}`}>{e.artist}</Link> : e.artist}</td>
                  <td>{n.format(e.views_gained)}</td>
                  <td>{e.peak_rank}</td>
                  <td>{e.days_on_chart}</td>
                  <td>{e.momentum}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Gain({ label, value, copy, locale }: { label: string; value: { views: number; days: number; includesGap: boolean } | null; copy: Copy; locale: Locale }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {value ? fmt(locale).format(value.views) : "—"}
        {value && (
          <small>
            {" "}{value.days} {copy.daysCovered}
            {value.includesGap ? ` · ${copy.includesGap}` : ""}
          </small>
        )}
      </dd>
    </div>
  );
}

function ReleaseTable({ release, copy, locale }: { release: NonNullable<Awaited<ReturnType<typeof getSongYouTube>>["summary"]["release"]>; copy: Copy; locale: Locale }) {
  const n = fmt(locale);
  return (
    <figure className="youtube-release">
      <figcaption>
        {copy.releaseCurve} · {release.publishedAt.slice(0, 10)}
        <small>{copy.releaseNote} ({release.comparedReleases})</small>
      </figcaption>
      <table className="operations-table">
        <thead>
          <tr><th>{copy.day}</th><th>{copy.views}</th><th>{copy.artistAverage}</th><th>{copy.vsAverage}</th></tr>
        </thead>
        <tbody>
          {release.points.map((p) => (
            <tr key={p.age}>
              <td>{p.age}{p.observedAgeDays !== null && p.observedAgeDays !== p.age ? ` (${p.observedAgeDays})` : ""}</td>
              <td>{p.views === null ? "—" : n.format(p.views)}</td>
              <td>{p.artistAverage === null ? "—" : n.format(p.artistAverage)}</td>
              <td>{p.vsAverage === null ? "—" : `×${p.vsAverage}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export async function SongYouTubePanel({ db, songId, locale }: { db: Db; songId: string; locale: Locale }) {
  const copy = getDictionary(locale).youtubeIntel;
  const { summary, videos } = await getSongYouTube(db, songId);
  const kinds = getDictionary(locale).youtubeCatalog.kinds;
  const n = fmt(locale);
  const max = Math.max(1, ...summary.series.map((p) => p.views));
  return (
    <section className="dashboard-panel youtube-panel" aria-labelledby={`yt-${songId}`}>
      <header><h2 id={`yt-${songId}`}>{copy.panelTitle}</h2></header>
      <Attribution copy={copy} asOf={summary.asOf} start={summary.windowStart} />
      {!summary.asOf ? (
        <p className="dashboard-empty">{videos.length ? copy.noStats : copy.noVideos}</p>
      ) : (
        <>
          <dl className="youtube-stats">
            <Gain label={copy.last7} value={summary.last7} copy={copy} locale={locale} />
            <Gain label={copy.last30} value={summary.last30} copy={copy} locale={locale} />
            <div>
              <dt>{copy.trackedRank}</dt>
              <dd>{summary.rank ? <>№{summary.rank.rank} <small>{signed(summary.rank.change)} · {copy.peak} №{summary.rank.peak}</small></> : copy.notRanked}</dd>
            </div>
          </dl>
          <ol className="youtube-bars" aria-label={copy.gained}>
            {summary.series.map((p) => (
              <li key={p.date} title={`${p.date}: ${n.format(p.views)}${p.gap ? ` (${copy.includesGap})` : ""}`}>
                <span style={{ height: `${Math.max(2, (p.views / max) * 100)}%` }} className={p.gap ? "is-gap" : undefined} />
                <span className="sr-only">{p.date}: {n.format(p.views)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      {summary.release && <ReleaseTable release={summary.release} copy={copy} locale={locale} />}
      {videos.length > 0 && (
        <>
          <h3>{copy.videos}</h3>
          <ul className="youtube-videos">
            {videos.map((v) => (
              <li key={v.assetId}>
                <a href={videoUrl(v.videoId)} target="_blank" rel="noreferrer">{v.title ?? v.videoId}</a>
                <small>
                  {v.kind ? (kinds[v.kind as keyof typeof kinds] ?? v.kind) : "—"}
                  {v.isPrimary ? ` · ${copy.primary}` : ""}
                  {v.verification !== "verified" ? ` · ${copy.suggested}` : ""}
                  {v.views !== null ? ` · ${n.format(v.views)} ${copy.views.toLowerCase()} (${v.asOf})` : ""}
                </small>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export async function ArtistYouTubePanel({ db, artistId, locale }: { db: Db; artistId: string; locale: Locale }) {
  const copy = getDictionary(locale).youtubeIntel;
  const { summary, linkedVideos } = await getArtistYouTube(db, artistId);
  const n = fmt(locale);
  return (
    <section className="dashboard-panel youtube-panel" aria-labelledby={`yt-${artistId}`}>
      <header><h2 id={`yt-${artistId}`}>{copy.panelTitle}</h2></header>
      <Attribution copy={copy} asOf={summary.asOf} start={summary.windowStart} />
      {!summary.asOf ? (
        <p className="dashboard-empty">{linkedVideos ? copy.noStats : copy.noVideos}</p>
      ) : (
        <dl className="youtube-stats">
          <Gain label={copy.last7} value={summary.last7} copy={copy} locale={locale} />
          <Gain label={copy.last30} value={summary.last30} copy={copy} locale={locale} />
          <div>
            <dt>{copy.mostViewed}</dt>
            <dd>
              {summary.mostViewed ? (
                <>
                  <a href={videoUrl(summary.mostViewed.videoId)} target="_blank" rel="noreferrer">{summary.mostViewed.title ?? summary.mostViewed.videoId}</a>
                  <small> {n.format(summary.mostViewed.views)} ({summary.mostViewed.date})</small>
                </>
              ) : "—"}
            </dd>
          </div>
        </dl>
      )}
      {summary.latestRelease && <ReleaseTable release={summary.latestRelease} copy={copy} locale={locale} />}
    </section>
  );
}

export async function YouTubeCoveragePanel({ db, locale }: { db: Db; locale: Locale }) {
  const copy = getDictionary(locale).youtubeIntel;
  const c = await getYouTubeCoverage(db);
  const n = fmt(locale);
  const share = coverageShare(c);
  const rows: [string, string][] = [
    [copy.coverageChannels, n.format(c.artistsWithChannel)],
    [copy.coverageVerified, n.format(c.linkedVerified)],
    [copy.coverageSuggested, n.format(c.linkedSuggested)],
    [copy.coverageCandidates, n.format(c.candidates)],
    [copy.coverageWatched, n.format(c.watched)],
    [copy.coverageCollected, `${n.format(c.collectedOnLatest)}${share === null ? "" : ` (${share}%)`}`],
    [copy.coverageLatest, c.latestDate ?? "—"],
  ];
  return (
    <section className="dashboard-panel youtube-panel" aria-labelledby="yt-coverage">
      <header><h2 id="yt-coverage">{copy.coverageTitle}</h2></header>
      <Attribution copy={copy} asOf={c.latestDate} start={c.windowStart} />
      <dl className="youtube-stats youtube-stats--coverage">
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      <p><Link href="/dashboard/catalog/youtube">{copy.coverageSuggested} →</Link></p>
    </section>
  );
}
