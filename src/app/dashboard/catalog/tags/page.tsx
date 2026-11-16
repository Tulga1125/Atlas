import Link from "next/link";
import { OperationsShell } from "@/components/operations/shell";
import { WorkflowForm } from "@/components/operations/workflow-form";
import { staffContext } from "@/modules/operations/data";
import { getLocale } from "@/modules/i18n/server";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { label } from "@/modules/operations/labels";
import { getOptionalChartSnapshot } from "@/modules/charts/current";
import { getAiEnvironment } from "@/lib/env";
import { unmappedGenres } from "@/modules/context/mapping";

export const metadata = { title: "Music context tagging" };

type Dimension = "genre" | "theme" | "mood" | "scene";

export default async function TaggingPage() {
  const context = await staffContext();
  const db = context.db;
  const locale = await getLocale();
  const copy = getDictionary(locale).tagging;
  const t = (key: string) => label(key, locale);
  const role = context.profile.role;
  const canVerify = ["administrator", "editor", "data_editor"].includes(role);
  const canMap = ["administrator", "data_editor"].includes(role);
  const isAdmin = role === "administrator";
  const snapshot = await getOptionalChartSnapshot();
  const chartSongIds = snapshot?.entries.map((e) => e.songId) ?? [];

  const [terms, chartTags, pending, mappings, sourceGenres] = await Promise.all([
    db.from("context_terms").select("id,dimension,slug,label_mn,label_en,status").order("dimension").order("sort_order"),
    chartSongIds.length
      ? db.from("song_context_tags").select("song_id,status,context_terms(dimension)").in("song_id", chartSongIds).eq("status", "verified")
      : Promise.resolve({ data: [], error: null }),
    db
      .from("song_context_tags")
      .select("id,status,source,evidence_url,evidence_note,model,song_id,songs(canonical_title),context_terms(dimension,label_mn,label_en)")
      .in("status", ["suggested", "disputed"])
      .order("assigned_at", { ascending: false })
      .limit(100),
    db.from("source_genre_mappings").select("source,source_value,term_id,status").eq("source", "apple_music"),
    db.from("song_source_genres").select("value").eq("source", "apple_music").limit(20_000),
  ]);
  if (terms.error || chartTags.error || pending.error || mappings.error || sourceGenres.error)
    throw new Error("Tagging workspace unavailable");

  const termName = (row: { label_mn: string; label_en: string }) => (locale === "mn" ? row.label_mn : row.label_en);
  const active = terms.data.filter((x) => x.status === "active");
  const songTermOptions = active
    .filter((x) => x.dimension !== "scene")
    .map((x) => ({ value: `${x.id}|${x.dimension}`, label: `${copy.dimensions[x.dimension as Dimension]} · ${termName(x)}` }));
  const verifiedBySong = new Map<string, Set<string>>();
  for (const tag of chartTags.data ?? []) {
    const dimension = tag.context_terms?.dimension;
    if (!dimension) continue;
    if (!verifiedBySong.has(tag.song_id)) verifiedBySong.set(tag.song_id, new Set());
    verifiedBySong.get(tag.song_id)!.add(dimension);
  }
  const coverage = (["genre", "theme", "mood"] as const).map((d) => ({
    dimension: d,
    count: chartSongIds.filter((id) => verifiedBySong.get(id)?.has(d)).length,
  }));
  const queue = (snapshot?.entries ?? [])
    .filter((e) => !(verifiedBySong.get(e.songId)?.has("genre") && verifiedBySong.get(e.songId)?.has("theme")))
    .sort((a, b) => b.daysOnChart - a.daysOnChart || a.rank - b.rank)
    .slice(0, 25);
  const genreOptions = [
    { value: "", label: copy.noAtlasGenre },
    ...active.filter((x) => x.dimension === "genre").map((x) => ({ value: x.id, label: termName(x) })),
  ];
  const genreCounts = new Map<string, number>();
  for (const g of sourceGenres.data) genreCounts.set(g.value, (genreCounts.get(g.value) ?? 0) + 1);
  const mappingRows = [
    ...mappings.data.map((m) => ({ ...m, songs: genreCounts.get(m.source_value) ?? 0 })),
    ...unmappedGenres(sourceGenres.data.map((g) => g.value), mappings.data.map((m) => ({ source: "apple_music" as const, sourceValue: m.source_value, termId: m.term_id, status: m.status })))
      .filter((u) => !mappings.data.some((m) => m.source_value === u.value))
      .map((u) => ({ source: "apple_music", source_value: u.value, term_id: null, status: "suggested" as const, songs: u.songs })),
  ].sort((a, b) => (a.status === "suggested" ? 0 : 1) - (b.status === "suggested" ? 0 : 1) || b.songs - a.songs || a.source_value.localeCompare(b.source_value));
  const aiOn = !!getAiEnvironment().ANTHROPIC_API_KEY;

  return (
    <OperationsShell section="catalog" currentPath="/dashboard/catalog/tags">
      <header className="youtube-catalog__header">
        <h2>{copy.title}</h2>
        <p>{copy.intro}</p>
        <p>
          <Link href="/methodology#music-context" className="text-link">
            {copy.howWeClassify} →
          </Link>
        </p>
      </header>

      <section aria-label={copy.coverage}>
        <h3>{copy.coverage}</h3>
        {snapshot ? (
          <ul className="tag-coverage">
            {coverage.map((c) => (
              <li key={c.dimension}>
                <strong>{c.count}</strong> {copy.coverageLine.replace("{total}", String(chartSongIds.length))} {copy.dimensions[c.dimension]}
              </li>
            ))}
          </ul>
        ) : (
          <p className="data-notice">{copy.noChart}</p>
        )}
      </section>

      {canVerify && (
        <section>
          <h3>{copy.actions}</h3>
          <div className="tag-actions">
            {canMap && <WorkflowForm hidden={{ operation: "source-suggest" }} button={copy.fromSourceGenres} />}
            {aiOn ? (
              <WorkflowForm
                hidden={{ operation: "ai-suggest" }}
                fields={[
                  {
                    name: "songs",
                    label: copy.queue,
                    type: "checkboxes",
                    options: queue.slice(0, 20).map((e) => ({ value: e.songId, label: `${e.title} · ${e.artist}` })),
                  },
                ]}
                button={copy.aiSuggest}
              />
            ) : (
              <p className="data-notice">{copy.aiOff}</p>
            )}
            <WorkflowForm hidden={{ operation: "profiles-recalc" }} button={copy.recalc} />
          </div>
        </section>
      )}

      <section>
        <h3>{copy.pending}</h3>
        <p>{copy.pendingHelp}</p>
        {pending.data.length === 0 ? (
          <p className="data-notice">{copy.pendingEmpty}</p>
        ) : (
          <WorkflowForm
            hidden={{ operation: "tag-review", kind: "song" }}
            fields={[
              {
                name: "tags",
                label: copy.pending,
                type: "checkboxes",
                options: pending.data.map((p) => ({
                  value: p.id,
                  label: `${p.songs?.canonical_title ?? p.song_id} — ${copy.dimensions[(p.context_terms?.dimension ?? "genre") as Dimension]}: ${p.context_terms ? termName(p.context_terms) : ""} (${copy.source[p.source as keyof typeof copy.source] ?? p.source}${p.model ? ` · ${p.model}` : ""}${p.status === "disputed" ? " · disputed" : ""}) — ${p.evidence_note ?? p.evidence_url ?? ""}`,
                })),
              },
              {
                name: "decision",
                label: copy.decision,
                type: "select",
                options: (["verify", "reject", "dispute"] as const).map((d) => ({ value: d, label: copy.decisions[d] })),
              },
              { name: "reason", label: t("reason"), type: "textarea", required: true },
            ]}
            button={copy.review}
            disabled={!canVerify}
          />
        )}
      </section>

      <section>
        <h3>{copy.queue}</h3>
        <p>{copy.queueHelp}</p>
        {!snapshot || queue.length === 0 ? (
          <p className="data-notice">{snapshot ? copy.queueEmpty : copy.noChart}</p>
        ) : (
          <div className="operations-cards">
            {queue.map((e) => (
              <article key={e.songId} data-song-id={e.songId}>
                <h2>
                  <Link href={`/dashboard/catalog/${e.songId}`}>{e.title}</Link>
                </h2>
                <p>
                  {e.artist} · №{e.rank} · {e.daysOnChart}
                </p>
                <WorkflowForm
                  hidden={{ operation: "tag-suggest", kind: "song", id: e.songId }}
                  fields={[
                    { name: "term", label: copy.term, type: "select", options: songTermOptions },
                    { name: "evidenceUrl", label: copy.evidenceUrl, type: "url" },
                    { name: "note", label: copy.note, type: "textarea" },
                  ]}
                  button={copy.suggest}
                />
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3>{copy.mappings}</h3>
        <p>{copy.mappingsHelp}</p>
        <div className="operations-cards">
          {mappingRows.slice(0, 40).map((m) => (
            <article key={m.source_value}>
              <h2>{m.source_value}</h2>
              <p>
                {m.songs} {copy.songs} · {t(m.status)}
              </p>
              <WorkflowForm
                hidden={{ operation: "mapping-review", value: m.source_value }}
                fields={[
                  { name: "term", label: copy.term, type: "select", value: m.term_id ?? "", options: genreOptions },
                  {
                    name: "decision",
                    label: copy.decision,
                    type: "select",
                    options: (["verify", "reject"] as const).map((d) => ({ value: d, label: copy.mappingDecisions[d] })),
                  },
                  { name: "reason", label: t("reason"), type: "textarea", required: true },
                ]}
                button={t("save")}
                disabled={!canMap}
              />
            </article>
          ))}
        </div>
      </section>

      <section>
        <h3>{copy.taxonomy}</h3>
        <p>{copy.taxonomyHelp}</p>
        <WorkflowForm
          hidden={{ operation: "term-change", action: "propose" }}
          fields={[
            {
              name: "dimension",
              label: copy.dimension,
              type: "select",
              options: (["genre", "theme", "mood", "scene"] as const).map((d) => ({ value: d, label: copy.dimensions[d] })),
            },
            { name: "slug", label: copy.slug, required: true },
            { name: "labelMn", label: copy.labelMn, required: true },
            { name: "labelEn", label: copy.labelEn, required: true },
            { name: "reason", label: t("reason"), type: "textarea", required: true },
          ]}
          button={copy.propose}
          disabled={!canVerify}
        />
        {terms.data.some((x) => x.status === "proposed") && (
          <>
            <h3>{copy.proposed}</h3>
            <div className="operations-cards">
              {terms.data
                .filter((x) => x.status === "proposed")
                .map((x) => (
                  <article key={x.id}>
                    <h2>
                      {x.label_mn} / {x.label_en}
                    </h2>
                    <p>
                      {copy.dimensions[x.dimension as Dimension]} · {x.slug}
                    </p>
                    <WorkflowForm
                      hidden={{ operation: "term-change", action: "approve", id: x.id }}
                      fields={[{ name: "reason", label: t("reason"), type: "textarea", required: true }]}
                      button={copy.approve}
                      disabled={!isAdmin}
                    />
                  </article>
                ))}
            </div>
          </>
        )}
      </section>
    </OperationsShell>
  );
}
