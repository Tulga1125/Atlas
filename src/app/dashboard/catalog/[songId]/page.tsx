import { notFound } from "next/navigation";
import { OperationsShell } from "@/components/operations/shell";
import { WorkflowForm } from "@/components/operations/workflow-form";
import { staffContext, songRow } from "@/modules/operations/data";
import { getLocale } from "@/modules/i18n/server";
import { label } from "@/modules/operations/labels";
import { SongYouTubePanel } from "@/components/youtube/youtube-panels";
import { z } from "zod";
export default async function CatalogPage({
  params,
}: {
  params: Promise<{ songId: string }>;
}) {
  const { songId } = await params,
    context = await staffContext();
  if (!context.db || !z.uuid().safeParse(songId).success) notFound();
  const locale = await getLocale(),
    t = (key: string) => label(key, locale);
  const [song, targets, recordings, history] = await Promise.all([
    context.db.from("songs").select("*").eq("id", songId).maybeSingle(),
    context.db
      .from("songs")
      .select("id,canonical_title")
      .is("redirect_to", null)
      .neq("id", songId)
      .order("canonical_title")
      .limit(500),
    context.db.from("recordings").select("*").eq("song_id", songId),
    context.db
      .from("catalog_operations")
      .select("id,action,reason,created_at")
      .eq("source_id", songId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  if (song.error || targets.error || recordings.error || history.error)
    throw new Error("Catalog unavailable");
  if (!song.data) notFound();
  const s = songRow.parse(song.data);
  const editable = ["administrator", "data_editor"].includes(
      context.profile.role,
    ),
    admin = context.profile.role === "administrator";
  return (
    <OperationsShell section="catalog" currentPath={`/dashboard/catalog/${songId}`}>
      <h2>{s.canonical_title}</h2>
      <SongYouTubePanel db={context.db} songId={s.id} locale={locale} />
      <WorkflowForm
        hidden={{ operation: "song", id: s.id }}
        fields={[
          {
            name: "title",
            label: t("title"),
            value: s.canonical_title,
            required: true,
          },
          { name: "language", label: t("language"), value: s.language ?? "" },
          { name: "genre", label: t("genre"), value: s.genre ?? "" },
          {
            name: "locality",
            label: t("locality"),
            type: "select",
            value: s.locality,
            options: ["local", "international", "mixed", "unknown"].map(
              (v) => ({ value: v, label: t(v) }),
            ),
          },
          { name: "alias", label: t("alias") },
          {
            name: "reason",
            label: t("reason"),
            type: "textarea",
            required: true,
          },
        ]}
        button={t("metadata")}
        disabled={!editable || !!s.redirect_to}
      />
      <h2>{locale === "mn" ? "Бичлэгүүд" : "Recordings"}</h2>
      {recordings.data?.map((r) => (
        <p key={r.id}>
          {r.version_name ?? r.recording_type} · ISRC {r.isrc ?? "—"} ·{" "}
          {r.duration_ms ?? "—"} ms
          <br />
          <code>{r.id}</code>
        </p>
      ))}
      {admin && !s.redirect_to && (
        <WorkflowForm
          hidden={{ operation: "catalog", source: s.id }}
          fields={[
            {
              name: "action",
              label: t("status"),
              type: "select",
              options: ["merge", "split"].map((v) => ({
                value: v,
                label: t(v),
              })),
            },
            {
              name: "target",
              label: t("target"),
              type: "select",
              required: true,
              options: targets.data?.map((row) => ({
                value: row.id,
                label: row.canonical_title,
              })),
            },
            {
              name: "recordings",
              label:
                locale === "mn" ? "Салгах бичлэгүүд" : "Recordings to split",
              type: "checkboxes",
              options: recordings.data?.map((r) => ({
                value: r.id,
                label: `${r.version_name ?? r.recording_type} · ISRC ${r.isrc ?? "—"} · ${r.duration_ms ?? "—"} ms`,
              })),
            },
            {
              name: "reason",
              label: t("reason"),
              type: "textarea",
              required: true,
            },
          ]}
          button={t("preview")}
          executeLabel={t("execute")}
        />
      )}
      <h2>{t("history")}</h2>
      {history.data?.map((o) => (
        <article key={o.id}>
          <p>
            {t(o.action)} · {o.created_at} · {o.reason}
          </p>
          {admin && ["merge", "split"].includes(o.action) && (
            <WorkflowForm
              hidden={{ operation: "undo", id: o.id }}
              fields={[
                {
                  name: "reason",
                  label: t("reason"),
                  type: "textarea",
                  required: true,
                },
              ]}
              button={t("undo")}
            />
          )}
        </article>
      ))}
    </OperationsShell>
  );
}
