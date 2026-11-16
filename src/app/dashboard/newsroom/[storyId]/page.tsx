import { notFound } from "next/navigation";
import { OperationsShell } from "@/components/operations/shell";
import {
  WorkflowForm,
  type WorkflowField,
} from "@/components/operations/workflow-form";
import { staffContext, storyRow } from "@/modules/operations/data";
import { getLocale } from "@/modules/i18n/server";
import { label } from "@/modules/operations/labels";
import { z } from "zod";
export default async function StoryPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const context = await staffContext();
  if (!context.db || !z.uuid().safeParse(storyId).success) notFound();
  const locale = await getLocale(),
    t = (key: string) => label(key, locale);
  const [story, drafts, people] = await Promise.all([
    context.db.from("story_leads").select("*").eq("id", storyId).maybeSingle(),
    context.db
      .from("editorial_drafts")
      .select("*")
      .eq("story_id", storyId)
      .order("created_at", { ascending: false }),
    context.db
      .from("profiles")
      .select("id,display_name,role")
      .eq("active", true)
      .in("role", ["writer", "editor", "administrator"]),
  ]);
  if (story.error || drafts.error || people.error)
    throw new Error("Newsroom unavailable");
  if (!story.data) notFound();
  const lead = storyRow.parse(story.data);
  const draft = drafts.data?.[0];
  const editor = ["administrator", "editor"].includes(context.profile.role),
    writer = editor || lead.assigned_to === context.profile.id;
  const hidden = {
    operation: "story",
    id: storyId,
    revision: String(lead.revision),
  };
  const actions: Record<string, string[]> = {
    needs_verification: ["verify", "dismiss"],
    detected: ["verify", "dismiss"],
    verified: ["assign", "dismiss"],
    assigned: ["assign"],
    drafting: ["submit", "assign"],
    editing: ["approve", "assign"],
    approved: ["publish"],
    published: ["publish", "archive"],
  };
  return (
    <OperationsShell section="newsroom" currentPath={`/dashboard/newsroom/${storyId}`}>
      <h2>{lead.headline}</h2>
      <p>{t(lead.status)}</p>
      <p>{lead.angle}</p>
      <details>
        <summary>{t("evidence")}</summary>
        <pre className="evidence-block">
          {JSON.stringify(lead.supporting_facts, null, 2)}
        </pre>
      </details>
      {writer && ["assigned", "drafting", "editing"].includes(lead.status) && (
        <WorkflowForm
          hidden={{ ...hidden, action: "draft" }}
          fields={["headlineMn", "bodyMn", "headlineEn", "bodyEn"].map(
            (name) => ({
              name,
              label: t(name),
              type: name.startsWith("body") ? "textarea" : "text",
              required: name.endsWith("Mn"),
              value:
                draft?.[
                  name === "headlineMn"
                    ? "headline_mn"
                    : name === "bodyMn"
                      ? "body_mn"
                      : name === "headlineEn"
                        ? "headline_en"
                        : "body_en"
                ] ?? (name === "headlineMn" ? lead.headline : ""),
            }),
          )}
          button={t("draft")}
        />
      )}
      <div className="operations-cards">
        {(actions[lead.status] ?? [])
          .filter((a) => (a === "submit" ? writer : editor))
          .map((action) => {
            const fields: WorkflowField[] =
              action === "assign"
                ? [
                    {
                      name: "assignee",
                      label: t("assignee"),
                      type: "select",
                      required: true,
                      value: lead.assigned_to ?? "",
                      options: people.data?.map((p) => ({
                        value: p.id,
                        label: p.display_name ?? p.id,
                      })),
                    },
                    {
                      name: "deadline",
                      label: t("deadline"),
                      type: "datetime-local",
                    },
                  ]
                : action === "publish"
                  ? [
                      {
                        name: "channel",
                        label: locale === "mn" ? "Суваг" : "Channel",
                        type: "select",
                        options: [
                          { value: "atlas", label: "Atlas" },
                          {
                            value: "external",
                            label:
                              locale === "mn"
                                ? "Гадаад сайт"
                                : "External website",
                          },
                        ],
                      },
                      {
                        name: "url",
                        label:
                          locale === "mn"
                            ? "Гадаад нийтлэлийн холбоос"
                            : "External publication URL",
                        type: "url",
                      },
                    ]
                  : action === "dismiss"
                    ? [
                        {
                          name: "reason",
                          label: t("reason"),
                          type: "textarea",
                          required: true,
                        },
                      ]
                    : [];
            return (
              <article key={action}>
                <WorkflowForm
                  hidden={{ ...hidden, action }}
                  fields={fields}
                  button={t(action)}
                />
              </article>
            );
          })}
      </div>
      <h2>{t("history")}</h2>
      {drafts.data?.map((d) => (
        <details key={d.id}>
          <summary>
            {d.created_at} · {d.headline_mn}
          </summary>
          <p className="article-body" lang="mn">
            {d.body_mn}
          </p>
          {d.body_en && (
            <p className="article-body" lang="en">
              {d.body_en}
            </p>
          )}
        </details>
      ))}
    </OperationsShell>
  );
}
