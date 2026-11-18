import Link from "next/link";
import type { Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";
import type { WeeklyChart } from "@/modules/charts/atlas-weekly";
import type { WeeklySong } from "@/modules/charts/atlas-weekly-data";
import { Movement } from "./movement";

const fmt = (locale: Locale) => new Intl.NumberFormat(locale === "mn" ? "mn-MN" : "en-US");
const moveStatus = (s: string, change: number | null) =>
  s === "new" ? "new" : s === "re_entry" ? "re_entry" : (change ?? 0) > 0 ? "up" : (change ?? 0) < 0 ? "down" : "unchanged";

/** The Atlas Mongolia Top 50 as a public chart table. */
export function AtlasChartTable({ chart, songs, locale, limit }: { chart: WeeklyChart; songs: Map<string, WeeklySong>; locale: Locale; limit?: number }) {
  const copy = getDictionary(locale).charts;
  const table = getDictionary(locale).table;
  const n = fmt(locale);
  const entries = typeof limit === "number" ? chart.entries.slice(0, limit) : chart.entries;
  return (
    <div className="chart-table-wrap">
      <table className="chart-table">
        <thead>
          <tr>
            <th scope="col">№</th>
            <th scope="col">{table.track}</th>
            <th scope="col">{table.move}</th>
            <th scope="col">{copy.score}</th>
            <th scope="col">{copy.appleRank}</th>
            <th scope="col">{copy.ytViews}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const s = songs.get(e.songId);
            return (
              <tr key={e.songId}>
                <td className="chart-table__rank">{String(e.rank).padStart(2, "0")}</td>
                <td>
                  <Link className="chart-table__track" href={`/songs/${e.songId}`}>
                    <span>{s?.title ?? e.songId}</span>
                    <small>{s?.artist}</small>
                  </Link>
                </td>
                <td><Movement change={e.change} locale={locale} status={moveStatus(e.status, e.change) as never} /></td>
                <td className="chart-table__numeric">{Math.round(e.score * 1000) / 10}</td>
                <td className="chart-table__numeric">{e.apple.bestRank === null ? copy.notOnApple : `№${e.apple.bestRank}`}</td>
                <td className="chart-table__numeric">{n.format(e.youtube.views)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export type YouTubeRow = { rank: number; song_id: string; title: string; artist: string; views_gained: number; previous_rank: number | null; rank_change: number | null; peak_rank: number; days_on_chart: number };

/** The YouTube Mongolia Top 100 as a public chart table. */
export function YouTubeChartTable({ entries, locale, limit }: { entries: YouTubeRow[]; locale: Locale; limit?: number }) {
  const copy = getDictionary(locale).charts;
  const table = getDictionary(locale).table;
  const n = fmt(locale);
  const rows = typeof limit === "number" ? entries.slice(0, limit) : entries;
  return (
    <div className="chart-table-wrap">
      <table className="chart-table">
        <thead>
          <tr>
            <th scope="col">№</th>
            <th scope="col">{table.track}</th>
            <th scope="col">{table.move}</th>
            <th scope="col">{copy.gained}</th>
            <th scope="col">{copy.peak}</th>
            <th scope="col">{copy.days}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.song_id}>
              <td className="chart-table__rank">{String(e.rank).padStart(2, "0")}</td>
              <td>
                <Link className="chart-table__track" href={`/songs/${e.song_id}`}>
                  <span>{e.title}</span>
                  <small>{e.artist}</small>
                </Link>
              </td>
              <td><Movement change={e.rank_change} locale={locale} status={(e.previous_rank === null ? "new" : (e.rank_change ?? 0) > 0 ? "up" : (e.rank_change ?? 0) < 0 ? "down" : "unchanged") as never} /></td>
              <td className="chart-table__numeric">+{n.format(e.views_gained)}</td>
              <td className="chart-table__numeric">{e.peak_rank}</td>
              <td className="chart-table__numeric">{e.days_on_chart}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
