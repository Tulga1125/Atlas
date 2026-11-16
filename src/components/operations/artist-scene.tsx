import Link from "next/link";
import { WorkflowForm } from "@/components/operations/workflow-form";
import { staffContext } from "@/modules/operations/data";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { label } from "@/modules/operations/labels";
import type { Locale } from "@/modules/i18n/config";

/** Scene labels for one artist (C1, D9): editors and administrators, with evidence. */
export async function ArtistScene({ artistId, locale }: { artistId: string; locale: Locale }) {
  const context = await staffContext();
  const copy = getDictionary(locale).tagging;
  const t = (key: string) => label(key, locale);
  const canLabel = ["administrator", "editor"].includes(context.profile.role);
  const [tags, terms] = await Promise.all([
    context.db
      .from("artist_context_tags")
      .select("id,status,evidence_url,evidence_note,context_terms(label_mn,label_en)")
      .eq("artist_id", artistId)
      .order("assigned_at", { ascending: false }),
    context.db.from("context_terms").select("id,label_mn,label_en").eq("dimension", "scene").eq("status", "active").order("sort_order"),
  ]);
  if (tags.error || terms.error) throw new Error("Scene labels unavailable");
  const name = (x: { label_mn: string; label_en: string } | null) => (x ? (locale === "mn" ? x.label_mn : x.label_en) : "");
  return (
    <section className="artist-scene" aria-labelledby="artist-scene-title">
      <h2 id="artist-scene-title">{copy.sceneTitle}</h2>
      <p>
        {copy.sceneHelp}{" "}
        <Link href="/methodology#music-context" className="text-link">
          {copy.howWeClassify}
        </Link>
      </p>
      {tags.data.map((tag) => (
        <article key={tag.id} className="artist-scene__tag">
          <strong>{name(tag.context_terms)}</strong> · {t(tag.status)}
          <small>{tag.evidence_note ?? tag.evidence_url}</small>
          {tag.status !== "unverified" && (
            <WorkflowForm
              hidden={{ operation: "tag-review", kind: "artist", id: tag.id }}
              fields={[
                {
                  name: "decision",
                  label: copy.decision,
                  type: "select",
                  options: (["verify", "reject", "dispute"] as const).map((d) => ({ value: d, label: copy.decisions[d] })),
                },
                { name: "reason", label: t("reason"), type: "textarea", required: true },
              ]}
              button={copy.review}
            />
          )}
        </article>
      ))}
      <WorkflowForm
        hidden={{ operation: "tag-suggest", kind: "artist", id: artistId }}
        fields={[
          { name: "term", label: copy.term, type: "select", options: terms.data.map((x) => ({ value: x.id, label: name(x) })) },
          { name: "evidenceUrl", label: copy.evidenceUrl, type: "url" },
          { name: "note", label: copy.note, type: "textarea" },
        ]}
        button={copy.suggest}
        disabled={!canLabel}
      />
    </section>
  );
}
