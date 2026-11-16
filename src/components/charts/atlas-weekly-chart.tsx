import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getDictionary } from "@/modules/i18n/dictionaries";
import type { Locale } from "@/modules/i18n/config";
import { getAtlasWeekly } from "@/modules/charts/atlas-weekly-data";

type Db = SupabaseClient<Database>;

/** The Atlas Mongolia Top 50, shown with its formula, status and sources. */
export async function AtlasWeeklyChart({ db, locale, week, basePath, staff }: { db: Db; locale: Locale; week?: string; basePath: string; staff: boolean }) {
  const copy = getDictionary(locale).atlasWeekly;
  const { charts, songs, windowStart, mode } = await getAtlasWeekly(db);
  const n = new Intl.NumberFormat(locale === "mn" ? "mn-MN" : "en-US");
  const sep = basePath.includes("?") ? "&" : "?";
  // Default: the latest final week, otherwise the running week.
  const chart = charts.find((c) => c.weekStart === week) ?? [...charts].reverse().find((c) => c.status === "final") ?? charts.at(-1);
  return (
    <section className="atlas-weekly" aria-labelledby="atlas-weekly-title">
      <header>
        <p className="eyebrow">{copy.subtitle}</p>
        <h2 id="atlas-weekly-title">{copy.title}</h2>
      </header>
      {!chart ? (
        <p className="workspace-empty">{copy.noWeeks}</p>
      ) : (
        <>
          <nav className="youtube-tabs" aria-label={copy.week}>
            {charts.map((c) => (
              <Link key={c.weekStart} href={`${basePath}${sep}week=${c.weekStart}`} aria-current={c.weekStart === chart.weekStart ? "page" : undefined}>
                {c.weekStart.slice(5)}–{c.weekEnd.slice(5)}
              </Link>
            ))}
          </nav>
          <p className="data-notice" role="status">
            {copy.week} {chart.weekStart} – {chart.weekEnd} · {chart.status === "final" ? copy.final : chart.status === "provisional" ? copy.provisional : copy.insufficient}
          </p>
          {chart.entries.length > 0 && (chart.status !== "insufficient" || staff) && (
            <div className="table-scroll">
              <table className="operations-table atlas-weekly__table">
                <thead>
                  <tr>
                    <th>{copy.rank}</th><th>{copy.change}</th><th>{copy.song}</th><th>{copy.artist}</th>
                    <th>{copy.score}</th><th>{copy.apple}</th><th>{copy.youtube}</th><th>{copy.peak}</th><th>{copy.weeks}</th>
                  </tr>
                </thead>
                <tbody>
                  {chart.entries.map((e) => {
                    const s = songs.get(e.songId);
                    return (
                      <tr key={e.songId}>
                        <td>{e.rank}</td>
                        <td>{e.status === "new" ? copy.new : e.status === "re_entry" ? copy.reEntry : e.change === 0 ? "=" : e.change! > 0 ? `+${e.change}` : e.change}</td>
                        <td><Link href={staff ? `/dashboard/catalog/${e.songId}` : `/songs/${e.songId}`}>{s?.title ?? e.songId}</Link></td>
                        <td>{s?.artistId ? <Link href={staff ? `/dashboard/artists/${s.artistId}` : `/artists/${s.artistId}`}>{s.artist}</Link> : s?.artist}</td>
                        <td>{Math.round(e.score * 1000) / 10}</td>
                        <td>{e.apple.bestRank === null ? copy.notOnApple : copy.appleDetail.replace("{rank}", String(e.apple.bestRank)).replace("{days}", String(e.apple.days))}</td>
                        <td>{n.format(e.youtube.views)}{e.youtube.includesGap ? " *" : ""}</td>
                        <td>{e.peak}</td>
                        <td>{e.weeksOnChart}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <p className="youtube-meta">{copy.formula}</p>
      <p className="youtube-meta">{copy.sources}</p>
      {mode === "30_day" && <p className="youtube-meta">{copy.retention.replace("{date}", windowStart)}</p>}
    </section>
  );
}
