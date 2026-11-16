"use server";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/modules/operations/auth";
import { getLocale } from "@/modules/i18n/server";

export type WorkflowState = {
  status: "idle" | "success" | "error";
  message?: string;
  preview?: string;
  fingerprint?: string;
};
export async function workflowAction(
  _previous: WorkflowState,
  form: FormData,
): Promise<WorkflowState> {
  const locale = await getLocale();
  const value = (key: string) => String(form.get(key) ?? "");
  try {
    const { db } = await requireStaff();
    const operation = value("operation");
    const id = () => z.uuid().parse(value("id"));
    const reason = () =>
      z.string().trim().min(10).max(2000).parse(value("reason"));
    let result;
    if (operation === "story") {
      const action = z
        .enum([
          "verify",
          "assign",
          "draft",
          "submit",
          "approve",
          "publish",
          "archive",
          "dismiss",
        ])
        .parse(value("action"));
      const values: Record<string, string> = {};
      for (const key of [
        "assignee",
        "deadline",
        "headlineMn",
        "bodyMn",
        "headlineEn",
        "bodyEn",
        "channel",
        "url",
        "reason",
      ])
        if (form.has(key)) values[key] = value(key);
      if (action === "publish" && values.url)
        z.httpUrl().max(2048).parse(values.url);
      if (action === "assign") {
        z.uuid().parse(values.assignee);
        if (values.deadline)
          values.deadline = new Date(values.deadline).toISOString();
      }
      result = await db.rpc("save_story", {
        p_id: id(),
        p_revision: z.coerce.number().int().positive().parse(value("revision")),
        p_action: action,
        p_values: values,
      });
    } else if (operation === "review") {
      result = await db.rpc("review_intelligence", {
        p_kind: z.enum(["signal", "anomaly"]).parse(value("kind")),
        p_id: id(),
        p_status: value("status"),
        p_reason: reason(),
      });
    } else if (operation === "retry") {
      result = await db.rpc("review_pipeline_job", {
        p_job: id(),
        p_reason: reason(),
      });
    } else if (operation === "reprocess" || operation === "revision") {
      result = await db.rpc(
        operation === "reprocess"
          ? "request_reprocessing"
          : "request_collection_revision",
        { p_snapshot: id(), p_reason: reason() },
      );
    } else if (operation === "create-song") {
      result = await db.rpc("create_catalog_song", {
        p_title: z.string().trim().min(1).max(240).parse(value("title")),
        p_artist: z.uuid().parse(value("artist")),
        p_reason: reason(),
      });
    } else if (operation === "song") {
      result = await db.rpc("review_song", {
        p_song: id(),
        p_title: z.string().trim().min(1).max(240).parse(value("title")),
        p_language: value("language"),
        p_genre: value("genre"),
        p_locality: z
          .enum(["local", "international", "mixed", "unknown"])
          .parse(value("locality")),
        p_alias: value("alias"),
        p_reason: reason(),
      });
    } else if (operation === "catalog") {
      const preview = value("execute") !== "yes";
      result = await db.rpc("catalog_operation", {
        p_action: z.enum(["merge", "split"]).parse(value("action")),
        p_source: z.uuid().parse(value("source")),
        p_target: z.uuid().parse(value("target")),
        p_recordings: form.getAll("recordings").map((s) => z.uuid().parse(s)),
        p_reason: preview ? "Preview only" : reason(),
        p_preview: preview,
        p_fingerprint: value("fingerprint") || undefined,
      });
      if (!result.error && preview)
        return {
          status: "success",
          message: locale === "mn" ? "Өөрчлөлтийн нөлөө" : "Impact preview",
          preview: (() => {
            const impact = z
              .object({
                recordings: z.number(),
                entries: z.number(),
                signals: z.number(),
                firstAffectedDate: z.string().nullable(),
              })
              .parse(result.data);
            return locale === "mn"
              ? `${impact.recordings} бичлэг, ${impact.entries} чартын мөр, ${impact.signals} сигнал. Дахин тооцоолох эхний өдөр: ${impact.firstAffectedDate ?? "—"}.`
              : `${impact.recordings} recordings, ${impact.entries} chart entries and ${impact.signals} signals affected. Recalculation begins ${impact.firstAffectedDate ?? "—"}.`;
          })(),
          fingerprint: z.object({ fingerprint: z.string() }).parse(result.data)
            .fingerprint,
        };
    } else if (operation === "undo") {
      result = await db.rpc("undo_catalog_operation", {
        p_operation: id(),
        p_reason: reason(),
      });
    } else throw new Error("invalid operation");
    if (result.error) throw new Error(result.error.message);
    updateTag("atlas-charts");
    revalidatePath("/", "layout");
    return {
      status: "success",
      message: locale === "mn" ? "Хадгаллаа." : "Saved.",
    };
  } catch (error) {
    const conflict =
      error instanceof Error && error.message.includes("conflict");
    return {
      status: "error",
      message:
        locale === "mn"
          ? conflict
            ? "Бүртгэл өөрчлөгдсөн байна. Дахин ачаалж хянана уу."
            : "Хадгалж чадсангүй. Эрх, талбарууд болон үйлдлийн дарааллыг шалгана уу."
          : conflict
            ? "This record changed. Reload and review the latest version."
            : "Unable to save. Check your access, required fields, and workflow state.",
    };
  }
}
