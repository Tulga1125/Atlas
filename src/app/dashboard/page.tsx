import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { Movement } from "@/components/charts/movement";
import { getOptionalChartSnapshot } from "@/modules/charts/current";
import { formatUlaanbaatarDate } from "@/modules/charts/format";
import { getAtlasBusinessDate } from "@/modules/collection/business-date";
import {
  getCommandCenterInputs,
  getDashboardData,
  StaffAccessError,
} from "@/modules/dashboard/repository";
import {
  buildCommandCenter,
  type Card,
  type SongItem,
} from "@/modules/dashboard/command-center";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocale } from "@/modules/i18n/server";
import type { Locale } from "@/modules/i18n/config";

export const metadata: Metadata = {
  title: "Command Center",
};

export const dynamic = "force-dynamic";

type Copy = ReturnType<typeof getDictionary>["commandCenter"];

function cardText(card: Card, copy: Copy, locale: Locale) {
  const none = copy.noValue;
  switch (card.key) {
    case "numberOne": {
      const [artist, state] = (card.detail ?? "|").split("|");
      return { value: card.value ?? none, detail: `${artist} · ${state === "held" ? copy.held : copy.changed}` };
    }
    case "highestNewEntry":
      return { value: card.value === null ? none : `№${card.value}`, detail: card.detail };
    case "biggestGainer":
      return { value: card.value === null ? none : `+${card.value}`, detail: card.detail };
    case "biggestFaller":
      return { value: card.value === null ? none : String(card.value), detail: card.detail };
    case "localTop100":
      return { value: card.value, detail: `${card.detail} ${copy.inTopTen}` };
    case "freshness":
      return {
        value: card.value ? formatUlaanbaatarDate(`${card.value}T12:00:00+08:00`, locale) : copy.neverCollected,
        detail:
          card.detail === "fresh"
            ? copy.fresh
            : card.detail?.startsWith("stale:")
              ? `${card.detail.slice(6)} ${copy.staleDays}`
              : null,
      };
    case "youtubeFreshness":
      return {
        value: card.value ?? copy.notRun,
        detail: card.detail && card.detail !== "none"
          ? (copy.statuses[card.detail as keyof Copy["statuses"]] ?? card.detail)
          : null,
      };
    default:
      return { value: card.value ?? none, detail: card.detail };
  }
}

function SongList({
  items,
  empty,
  locale,
  showChange = true,
  note,
}: {
  items: SongItem[];
  empty: string;
  locale: Locale;
  showChange?: boolean;
  note?: (item: SongItem) => string | null;
}) {
  if (items.length === 0) return <p className="dashboard-empty">{empty}</p>;
  return (
    <ol className="cc-songs">
      {items.map((item) => (
        <li key={item.songId}>
          <Link href={item.href}>
            <strong>{String(item.rank).padStart(2, "0")}</strong>
            <span>
              {item.title}
              <small>
                {item.artist}
                {note?.(item) ? ` · ${note(item)}` : ""}
              </small>
            </span>
            {showChange && (
              <Movement
                change={item.change}
                locale={locale}
                status={item.note === "new" || item.note === "re_entry" ? item.note : (item.change ?? 0) > 0 ? "up" : (item.change ?? 0) < 0 ? "down" : "unchanged"}
              />
            )}
          </Link>
        </li>
      ))}
    </ol>
  );
}

function Panel({
  title,
  rule,
  link,
  linkLabel,
  children,
}: {
  title: string;
  rule?: string;
  link?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="dashboard-panel cc-panel">
      <header>
        <div>
          <h2>{title}</h2>
          {rule && <p className="cc-rule">{rule}</p>}
        </div>
        {link && (
          <Link href={link} aria-label={linkLabel ?? title}>
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        )}
      </header>
      {children}
    </article>
  );
}

export default async function DashboardPage() {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const copy = dictionary.commandCenter;
  const today = getAtlasBusinessDate();
  const snapshot = await getOptionalChartSnapshot();
  let dashboard, inputs;
  try {
    [dashboard, inputs] = await Promise.all([
      getDashboardData(snapshot),
      getCommandCenterInputs(today),
    ]);
  } catch (error) {
    if (
      error instanceof StaffAccessError &&
      (error.code === "unauthenticated" || error.code === "inactive")
    ) {
      redirect("/login?error=access_denied");
    }
    throw error;
  }

  const cc = buildCommandCenter({
    snapshot,
    history: inputs.history,
    jobs: inputs.jobs,
    today,
    activeAnomalies: dashboard.counts.anomalies,
    leadsAwaitingReview: inputs.leadsAwaitingReview,
    youtube: inputs.youtube,
  });
  const historyDays = new Set(inputs.history.map((r) => r.date)).size;
  const watchEmpty = `${copy.emptyModule} ${copy.historyNeeded} ${historyDays} ${copy.days}.`;
  const maxShare = Math.max(1, ...cc.localShare.map((r) => r.top100));

  return (
    <main className="dashboard-shell">
      <DashboardSidebar counts={dashboard.counts} locale={locale} profile={dashboard.profile} />
      <section className="dashboard-main">
        <DashboardHeader
          title={dictionary.dashboard.greeting}
          eyebrow={formatUlaanbaatarDate(snapshot?.collectedAt ?? new Date().toISOString(), locale)}
          status={
            <>
              <span className={`freshness__dot${snapshot?.date === today ? "" : " freshness__dot--stale"}`} />
              {snapshot ? `${dictionary.dashboard.approvedData} ${snapshot.date}` : copy.neverCollected}
            </>
          }
          currentPath="/dashboard"
          locale={locale}
        />

        {!cc.hasChart && (
          <div className="cc-empty" role="status">
            <strong>{copy.emptyTitle}</strong>
            <p>{copy.emptyBody}</p>
          </div>
        )}

        <section className="cc-cards" aria-label={dictionary.dashboard.dailySummary}>
          {cc.cards.map((card) => {
            const text = cardText(card, copy, locale);
            return (
              <Link key={card.key} href={card.href} className={`cc-card${card.tone ? ` cc-card--${card.tone}` : ""}${card.key === "numberOne" ? " cc-card--feature" : ""}`}>
                <span>{copy.cards[card.key as keyof Copy["cards"]]}</span>
                <strong>{text.value}</strong>
                {text.detail && <small>{text.detail}</small>}
                <em>{copy.evidence} →</em>
              </Link>
            );
          })}
        </section>

        {cc.hasChart && (
          <section className="cc-grid">
            <Panel title={copy.modules.topTen} link={`/charts/apple-music-mongolia?date=${cc.chartDate}`}>
              <SongList items={cc.topTen} empty={copy.emptyModule} locale={locale} />
            </Panel>
            <Panel title={copy.modules.gainers} rule={copy.rules.gainers} link="/dashboard/charts?sort=movement">
              <SongList items={cc.gainers} empty={copy.emptyModule} locale={locale} />
            </Panel>
            <Panel title={copy.modules.fallers} link="/dashboard/charts?sort=movement">
              <SongList items={cc.fallers} empty={copy.emptyModule} locale={locale} />
            </Panel>
            <Panel title={copy.modules.emerging} rule={copy.rules.emerging}>
              <SongList
                items={cc.emerging}
                empty={copy.emptyModule}
                locale={locale}
                note={(item) => (item.note?.startsWith("days:") ? `${item.note.slice(5)} ${copy.daysOnChart}` : null)}
              />
            </Panel>
            <Panel title={copy.modules.entries} link={`/charts/apple-music-mongolia?date=${cc.chartDate}`}>
              <SongList items={cc.newAndReEntries} empty={copy.emptyModule} locale={locale} />
            </Panel>
            <Panel title={copy.modules.approaching} rule={copy.rules.approaching}>
              <SongList items={cc.approachingTopTen} empty={watchEmpty} locale={locale} />
            </Panel>
            <Panel title={copy.modules.atRisk} rule={copy.rules.atRisk}>
              <SongList items={cc.atRisk} empty={watchEmpty} locale={locale} />
            </Panel>
            <Panel title={copy.modules.artists}>
              {cc.artistMomentum.length === 0 ? (
                <p className="dashboard-empty">{copy.emptyModule}</p>
              ) : (
                <ul className="cc-artists">
                  {cc.artistMomentum.map((a) => (
                    <li key={a.artist}>
                      <Link href={`/search?q=${encodeURIComponent(a.artist)}`}>
                        <strong>{a.artist}</strong>
                        <small>
                          {a.entries} {copy.entriesShort} · {a.topTwenty} {copy.topTwenty} · {copy.best} №{a.bestRank} · {copy.net} {a.netChange > 0 ? `+${a.netChange}` : a.netChange}
                        </small>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title={copy.modules.localShare}>
              <ul className="cc-share">
                {cc.localShare.map((row) => (
                  <li key={row.date}>
                    <Link href={row.href}>
                      <time>{row.date.slice(5)}</time>
                      <span className="cc-share__bar" style={{ width: `${(row.top100 / maxShare) * 100}%` }} />
                      <small>
                        {row.top100} · {row.top10} {copy.inTopTen}
                      </small>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          </section>
        )}

        <section className="cc-grid">
          <Panel title={copy.modules.anomalies} link="/dashboard/anomalies">
            {dashboard.anomalies.length === 0 ? (
              <p className="dashboard-empty">{dictionary.dashboard.noAlerts}</p>
            ) : (
              <ul className="cc-artists">
                {dashboard.anomalies.slice(0, 5).map((a) => (
                  <li key={a.id}>
                    <Link href="/dashboard/anomalies">
                      <strong>{a.summary}</strong>
                      <small>
                        {a.severity} · {a.detectedAt.slice(0, 10)}
                      </small>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title={copy.modules.stories} link="/dashboard/newsroom">
            {dashboard.stories.length === 0 ? (
              <p className="dashboard-empty">{dictionary.dashboard.noStories}</p>
            ) : (
              <ul className="cc-artists">
                {dashboard.stories.slice(0, 5).map((s) => (
                  <li key={s.id}>
                    <Link href={s.source === "story_lead" ? `/dashboard/newsroom/${s.id}` : "/dashboard/signals"}>
                      <strong>{s.headline}</strong>
                      <small>
                        {s.priority} · {s.detail}
                      </small>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title={copy.modules.health} link="/dashboard/data-health">
            <ol className="cc-health">
              {cc.health.map((day) => (
                <li key={day.date}>
                  <Link href={day.href} className={`cc-health__day cc-health__day--${day.status}`} title={`${day.date}: ${copy.statuses[day.status]}`}>
                    <span className="sr-only">
                      {day.date}: {copy.statuses[day.status]}
                    </span>
                    <time aria-hidden="true">{day.date.slice(8)}</time>
                  </Link>
                </li>
              ))}
            </ol>
          </Panel>
        </section>
        <p className="cc-version">
          {copy.version}: {cc.version}
        </p>
      </section>
    </main>
  );
}
