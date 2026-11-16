import { getDictionary } from "@/modules/i18n/dictionaries";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/components/operations/shell";
import {
  WorkflowForm,
  type WorkflowField,
} from "@/components/operations/workflow-form";
import {
  staffContext,
  operationsData,
  emptyOperations,
} from "@/modules/operations/data";
import { getLocale } from "@/modules/i18n/server";
import { label } from "@/modules/operations/labels";
import { getArchive, compareCharts } from "@/modules/charts/history";
import { getCurrentChartSnapshot } from "@/modules/charts/current";
import { ChartTable } from "@/components/charts/chart-table";
import { getAtlasBusinessDate } from "@/modules/collection/business-date";
import {
  ChartSourceTabs,
  YouTubeCoveragePanel,
  YouTubeTrackedChart,
} from "@/components/youtube/youtube-panels";
import { AtlasWeeklyChart } from "@/components/charts/atlas-weekly-chart";
import { z } from "zod";
export const dynamic = "force-dynamic";
export default async function Workspace({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { section } = await params;
  if (
    ![
      "charts",
      "signals",
      "anomalies",
      "catalog",
      "newsroom",
      "data-health",
    ].includes(section)
  )
    notFound();
  const locale = await getLocale(),
    t = (key: string) => label(key, locale),
    context = await staffContext(),
    query = await searchParams;
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .catch(1)
    .parse(query.page);
  const data = context.db
    ? await operationsData(
        context.db,
        page,
        section === "catalog" ? query.q : "",
      )
    : emptyOperations;
  const recordCount = (section === "newsroom"
    ? data.stories
    : section === "signals"
      ? data.signals
      : section === "anomalies"
        ? data.anomalies
        : section === "catalog"
          ? data.songs
          : data.jobs).length;
  const editable =
    ["administrator", "data_editor", "editor"].includes(context.profile.role);
  const reason: WorkflowField = {
    name: "reason",
    label: t("reason"),
    type: "textarea",
    required: true,
  };
  const archive = await getArchive();
  const latest = archive.snapshots[0];
  let chartContent: React.ReactNode = null;
  if (section === "charts" && query.source === "atlas") {
    const week = z.iso.date().safeParse(query.week);
    chartContent = (
      <>
        <ChartSourceTabs locale={locale} active="atlas" />
        <AtlasWeeklyChart db={context.db} locale={locale} week={week.success ? week.data : undefined} basePath="/dashboard/charts?source=atlas" staff />
      </>
    );
  } else if (section === "charts" && query.source === "youtube") {
    const date = z.iso.date().safeParse(query.date);
    chartContent = (
      <>
        <ChartSourceTabs locale={locale} active="youtube" />
        <YouTubeTrackedChart db={context.db} locale={locale} date={date.success ? date.data : undefined} />
      </>
    );
  } else if (section === "charts") {
    const from = z.iso.date().safeParse(query.from),
      to = z.iso.date().safeParse(query.to);
    const comparison =
      from.success && to.success
        ? await compareCharts(from.data, to.data)
        : null;
    const snapshot = latest
      ? await getCurrentChartSnapshot(to.success ? to.data : undefined)
      : null;
    const entries =
      snapshot?.entries.filter(
        (e) =>
          (!query.q ||
            `${e.title} ${e.artist}`
              .toLowerCase()
              .includes(query.q.toLowerCase())) &&
          (!query.status || e.entryStatus === query.status) &&
          (!query.local || String(e.isLocal) === query.local),
      ) ?? [];
    if (query.sort === "momentum")
      entries.sort((a, b) => b.momentumScore - a.momentumScore);
    if (query.sort === "movement")
      entries.sort((a, b) => (b.rankChange ?? -101) - (a.rankChange ?? -101));
    chartContent = (
      <>
        <ChartSourceTabs locale={locale} active="apple" />
        <form className="filter-form">
          <label>
            {t("from")}
            <input
              type="date"
              name="from"
              defaultValue={
                query.from ??
                archive.snapshots[1]?.snapshot_date ??
                latest?.snapshot_date
              }
            />
          </label>
          <label>
            {t("to")}
            <input
              type="date"
              name="to"
              defaultValue={query.to ?? latest?.snapshot_date}
            />
          </label>
          <label>
            {t("search")}
            <input name="q" defaultValue={query.q} />
          </label>
          <label>
            {t("status")}
            <select name="status" defaultValue={query.status}>
              <option value="">{t("all")}</option>
              {["new", "re_entry", "up", "down", "unchanged"].map((s) => (
                <option key={s} value={s}>
                  {t(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("locality")}
            <select name="local" defaultValue={query.local}>
              <option value="">{t("all")}</option>
              <option value="true">{t("local")}</option>
              <option value="false">{t("international")}</option>
            </select>
          </label>
          <label>
            {locale === "mn" ? "Эрэмбэлэх" : "Sort"}
            <select name="sort" defaultValue={query.sort}>
              <option value="rank">№</option>
              <option value="momentum">
                {locale === "mn" ? "Эрч" : "Momentum"}
              </option>
              <option value="movement">
                {locale === "mn" ? "Хөдөлгөөн" : "Movement"}
              </option>
            </select>
          </label>
          <button>{t("compare")}</button>
        </form>
        {comparison && (
          <div className="table-scroll">
            <table className="operations-table">
              <caption>
                {comparison.from} → {comparison.to}
              </caption>
              <thead>
                <tr>
                  <th>{t("title")}</th>
                  <th>{t("from")}</th>
                  <th>{t("to")}</th>
                  <th>Δ</th>
                </tr>
              </thead>
              <tbody>
                {comparison.entries.map((e) => (
                  <tr key={e.songId}>
                    <td>
                      <Link href={`/songs/${e.songId}`}>{e.title}</Link>
                    </td>
                    <td>{e.fromRank ?? "—"}</td>
                    <td>{e.toRank ?? "—"}</td>
                    <td>
                      {e.change ??
                        (locale === "mn"
                          ? e.status === "exit"
                            ? "Гарсан"
                            : "Орсон"
                          : e.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {snapshot ? (
          <ChartTable entries={entries} locale={locale} />
        ) : (
          <p className="workspace-empty">{t("noSnapshot")}</p>
        )}
      </>
    );
  }
  return (
    <OperationsShell section={section}>
      {section === "charts" && chartContent}
      {section === "newsroom" && (
        <>
          <h2>{t("brief")}</h2>
          {data.briefs.map((b) => (
            <details key={b.id}>
              <summary>{b.created_at.slice(0, 10)}</summary>
              <p className="article-body" lang="mn">
                {b.body_mn}
              </p>
            </details>
          ))}
          <div className="operations-list">
            {data.stories.map((s) => (
              <Link href={`/dashboard/newsroom/${s.id}`} key={s.id}>
                <span>{s.headline}</span>
                <small>
                  {t(s.status)} · {t(s.priority)}
                </small>
              </Link>
            ))}
          </div>
        </>
      )}
      {(section === "signals" || section === "anomalies") && (
        <div className="operations-cards">
          {(section === "signals"
            ? data.signals.map((s) => ({
                id: s.id,
                title: s.headline_summary,
                kind: t(`signal_${s.signal_type}`),
                explanation: (() => {
                  const payload = s.signal_evidence?.[0]?.payload;
                  return payload && typeof payload === "object" && "explanation" in payload
                    ? String((payload as { explanation: unknown }).explanation)
                    : null;
                })(),
                status: s.status,
                severity: s.severity,
                evidence: s.signal_evidence ?? [],
              }))
            : data.anomalies.map((a) => ({
                id: a.id,
                title: a.summary,
                kind: null,
                explanation: null,
                status: a.status,
                severity: a.severity,
                evidence: a.evidence,
              }))
          ).map((row) => (
            <article key={row.id}>
              <h2>{row.title}</h2>
              {row.kind && <p className="eyebrow">{row.kind}</p>}
              {row.explanation && <p>{row.explanation}</p>}
              <p>
                {t(row.status)} · {t(row.severity)}
              </p>
              <details>
                <summary>{t("evidence")}</summary>
                <pre className="evidence-block">
                  {JSON.stringify(row.evidence, null, 2)}
                </pre>
              </details>
              <WorkflowForm
                hidden={{
                  operation: "review",
                  kind: section === "signals" ? "signal" : "anomaly",
                  id: row.id,
                }}
                fields={[
                  {
                    name: "status",
                    label: t("status"),
                    type: "select",
                    options: (section === "signals"
                      ? ["under_review", "confirmed", "dismissed"]
                      : [
                          "reviewing",
                          "confirmed_event",
                          "data_error",
                          "dismissed",
                          "resolved",
                        ]
                    ).map((s) => ({ value: s, label: t(s) })),
                  },
                  reason,
                ]}
                button={t("save")}
                disabled={!editable}
              />
            </article>
          ))}
        </div>
      )}
      {section === "catalog" && (
        <>
          <form className="filter-form">
            <label>
              {t("search")}
              <input name="q" defaultValue={query.q} />
            </label>
            <button>{t("search")}</button>
          </form>
          {editable && (
            <details>
              <summary>
                {locale === "mn" ? "Дуу нэмэх" : "Create canonical song"}
              </summary>
              <WorkflowForm
                hidden={{ operation: "create-song" }}
                fields={[
                  { name: "title", label: t("title"), required: true },
                  {
                    name: "artist",
                    label:
                      locale === "mn"
                        ? "Үндсэн уран бүтээлч"
                        : "Primary artist",
                    type: "select",
                    options: data.artists.map((a) => ({
                      value: a.id,
                      label: a.canonical_name,
                    })),
                    required: true,
                  },
                  reason,
                ]}
                button={t("save")}
              />
            </details>
          )}
          <Link className="text-link" href="/dashboard/artists">
            {locale === "mn" ? "Уран бүтээлч шалгах" : "Artist identity review"}{" "}
            →
          </Link>
          <Link href="/dashboard/catalog/tags" className="text-link">
            {getDictionary(locale).tagging.link} →
          </Link>
          <Link href="/dashboard/catalog/youtube" className="text-link">
            {getDictionary(locale).youtubeCatalog.catalogLink} →
          </Link>
          <div className="operations-list">
            {data.songs.map((s) => (
              <Link href={`/dashboard/catalog/${s.id}`} key={s.id}>
                <span>{s.canonical_title}</span>
                <small>
                  {t(s.verification)} · {t(s.locality)}
                </small>
              </Link>
            ))}
          </div>
        </>
      )}
      {section === "data-health" && (
        <>
          <YouTubeCoveragePanel db={context.db} locale={locale} />
          <p className="data-notice">
            {latest
              ? `${t(latest.snapshot_date === getAtlasBusinessDate() ? "fresh" : "stale")}: ${latest.snapshot_date}`
              : t("noSnapshot")}
          </p>
          <div className="operations-cards">
            {data.jobs.map((j) => (
              <article key={j.id}>
                <h2>
                  {j.business_date} ·{" "}
                  {t(`job_${j.kind}`)}
                </h2>
                <p>
                  {t(j.status)} · {t("attempts")}: {j.attempts}
                </p>
                <Link href={`/dashboard/data-health/${j.id}`}>
                  {t("evidence")} →
                </Link>
                {j.error_message && <p role="status">{j.error_message}</p>}
                {["failed", "review"].includes(j.status) &&
                  j.error_code !== "missed_date" && (
                    <WorkflowForm
                      hidden={{ operation: "retry", id: j.id }}
                      fields={[reason]}
                      button={t("retry")}
                      disabled={!editable}
                    />
                  )}
              </article>
            ))}
          </div>
          {latest && context.profile.role === "administrator" && (
            <div className="operations-cards">
              {["reprocess", "revision"].map((operation) => (
                <article key={operation}>
                  <h2>{t(operation)}</h2>
                  <WorkflowForm
                    hidden={{ operation, id: latest.id }}
                    fields={[reason]}
                    button={t(operation)}
                    disabled={
                      (operation === "revision" &&
                        latest.snapshot_date !== getAtlasBusinessDate())
                    }
                  />
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {section !== "charts" && recordCount === 0 && <p className="workspace-empty">{t("empty")}</p>}
      {section !== "charts" && (recordCount > 0 || page > 1) && (
        <nav
          className="pagination"
          aria-label={locale === "mn" ? "Хуудас" : "Pages"}
        >
          {page > 1 && (
            <Link href={{ query: { ...query, page: String(page - 1) } }}>
              ← {page - 1}
            </Link>
          )}
          <span aria-current="page">{page}</span>
          {recordCount === 50 && (
            <Link href={{ query: { ...query, page: String(page + 1) } }}>
              {page + 1} →
            </Link>
          )}
        </nav>
      )}
    </OperationsShell>
  );
}
