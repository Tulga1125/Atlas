"use server";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/modules/operations/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { assetKinds, parseVideoId } from "@/modules/youtube/video";
import { getAiEnvironment } from "@/lib/env";
import {
  PROFILE_METHOD,
  calculateArtistProfiles,
} from "@/modules/context/profile";
import {
  TAG_PROMPT_VERSION,
  createAiClient,
  suggestTags,
} from "@/modules/context/ai-suggest";
import {
  createYouTubeClient,
  fetchManualVideo,
} from "@/modules/youtube/discovery";
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
    const { db, profile } = await requireStaff();
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
    } else if (operation === "youtube-review") {
      const action = z
        .enum(["link", "confirm", "reject", "unlink", "kind", "primary"])
        .parse(value("action"));
      result = await db.rpc("review_youtube_video", {
        p_asset: id(),
        p_action: action,
        p_reason: reason(),
        p_recording: value("recording")
          ? z.uuid().parse(value("recording"))
          : undefined,
        p_kind: value("kind")
          ? z.enum(assetKinds).parse(value("kind"))
          : undefined,
      });
    } else if (operation === "youtube-watch") {
      result = await db.rpc("set_youtube_watch", {
        p_asset: id(),
        p_active: z.enum(["on", "off"]).parse(value("active")) === "on",
        p_reason: reason(),
      });
    } else if (operation === "youtube-add") {
      // The database re-checks the role; this avoids a needless API call.
      if (!["administrator", "data_editor"].includes(profile.role))
        throw new Error("forbidden");
      const videoId = parseVideoId(value("url"));
      if (!videoId) throw new Error("invalid video url");
      const apiKey = process.env.YOUTUBE_API_KEY;
      if (!apiKey) throw new Error("youtube not configured");
      const admin = createAdminClient();
      const channels = await admin
        .from("artist_platform_profiles")
        .select("platform_artist_id")
        .eq("platform_id", "00000000-0000-0000-0000-000000000002")
        .eq("match_status", "verified");
      if (channels.error) throw new Error(channels.error.message);
      const fetched = await fetchManualVideo(
        createYouTubeClient(apiKey),
        videoId,
        new Set(channels.data.map((c) => c.platform_artist_id)),
      );
      if (!fetched.candidate) throw new Error("video unavailable");
      result = await admin.rpc("record_manual_youtube_video", {
        p_actor: profile.id,
        p_reason: reason(),
        p_source_url: fetched.evidence.sourceUrl,
        p_http_status: fetched.evidence.status,
        p_raw_body: fetched.evidence.rawBody,
        p_checksum: fetched.evidence.checksum,
        p_video: fetched.candidate,
      });
    } else if (operation === "tag-suggest") {
      const [termId] = value("term").split("|");
      result = await db.rpc("suggest_context_tag", {
        p_kind: z.enum(["song", "artist"]).parse(value("kind")),
        p_subject: id(),
        p_term: z.uuid().parse(termId),
        p_evidence_url: value("evidenceUrl")
          ? z.httpUrl().max(2048).parse(value("evidenceUrl"))
          : "",
        p_evidence_note: value("note"),
      });
    } else if (operation === "tag-review") {
      const kind = z.enum(["song", "artist"]).parse(value("kind"));
      const decision = z.enum(["verify", "reject", "dispute"]).parse(value("decision"));
      const ids = form.has("tags")
        ? form.getAll("tags").map((t) => z.uuid().parse(String(t)))
        : [id()];
      if (ids.length === 0) throw new Error("choose at least one tag");
      for (const tag of ids) {
        result = await db.rpc("review_context_tag", {
          p_kind: kind,
          p_tag: tag,
          p_decision: decision,
          p_reason: reason(),
        });
        if (result.error) break;
      }
    } else if (operation === "mapping-review") {
      const term = value("term");
      result = await db.rpc("review_genre_mapping", {
        p_source: "apple_music",
        p_value: z.string().min(1).max(200).parse(value("value")),
        // Null records an explicit "no Atlas genre" decision for this value.
        p_term: term ? z.uuid().parse(term) : (null as unknown as string),
        p_verify: value("decision") !== "reject",
        p_reason: reason(),
      });
    } else if (operation === "source-suggest") {
      result = await db.rpc("suggest_tags_from_source_genres");
    } else if (operation === "term-change") {
      result = await db.rpc("change_context_term", {
        p_action: z.enum(["propose", "approve", "retire"]).parse(value("action")),
        p_reason: reason(),
        p_term: value("id") ? z.uuid().parse(value("id")) : undefined,
        p_dimension: value("dimension") || undefined,
        p_slug: value("slug") || undefined,
        p_label_mn: value("labelMn") || undefined,
        p_label_en: value("labelEn") || undefined,
      });
    } else if (operation === "profiles-recalc") {
      if (!["administrator", "data_editor", "editor"].includes(profile.role))
        throw new Error("forbidden");
      const [tags, credits, facts] = await Promise.all([
        db
          .from("song_context_tags")
          .select("song_id,term_id,context_terms(dimension)")
          .eq("status", "verified")
          .limit(20_000),
        db.from("song_artists").select("song_id,artist_id").limit(50_000),
        db.from("chart_facts").select("song_id").limit(100_000),
      ]);
      if (tags.error || credits.error || facts.error)
        throw new Error("profile inputs unavailable");
      const days = new Map<string, number>();
      for (const f of facts.data)
        if (f.song_id) days.set(f.song_id, (days.get(f.song_id) ?? 0) + 1);
      const artistsBySong = new Map<string, string[]>();
      for (const c of credits.data)
        artistsBySong.set(c.song_id, [...(artistsBySong.get(c.song_id) ?? []), c.artist_id]);
      const rows = calculateArtistProfiles(
        [...artistsBySong].map(([songId, artistIds]) => ({
          songId,
          artistIds,
          chartDays: days.get(songId) ?? 0,
        })),
        tags.data.flatMap((t) => {
          const dimension = t.context_terms?.dimension;
          return dimension === "genre" || dimension === "theme" || dimension === "mood"
            ? [{ songId: t.song_id, termId: t.term_id, dimension }]
            : [];
        }),
        { weightByChartDays: false },
      );
      result = await db.rpc("store_context_profile_run", {
        p_method: PROFILE_METHOD,
        p_parameters: { weightByChartDays: false },
        p_rows: rows,
      });
    } else if (operation === "ai-suggest") {
      if (!["administrator", "data_editor", "editor"].includes(profile.role))
        throw new Error("forbidden");
      const ai = getAiEnvironment();
      if (!ai.ANTHROPIC_API_KEY) throw new Error("ai not configured");
      const songIds = form.getAll("songs").map((s) => z.uuid().parse(String(s))).slice(0, 20);
      const [songs, credits, genres, terms] = await Promise.all([
        db.from("songs").select("id,canonical_title").in("id", songIds),
        db.from("song_artists").select("song_id,artists(canonical_name)").in("song_id", songIds),
        db.from("song_source_genres").select("song_id,value").in("song_id", songIds),
        db.from("context_terms").select("dimension,slug,label_en").eq("status", "active").in("dimension", ["genre", "theme", "mood"]),
      ]);
      if (songs.error || credits.error || genres.error || terms.error)
        throw new Error("ai inputs unavailable");
      const { suggestions } = await suggestTags(
        createAiClient(ai.ANTHROPIC_API_KEY),
        ai.ATLAS_AI_MODEL,
        songs.data.map((s) => ({
          songId: s.id,
          title: s.canonical_title,
          artists: credits.data.filter((c) => c.song_id === s.id).map((c) => c.artists?.canonical_name ?? "").filter(Boolean),
          sourceGenres: genres.data.filter((g) => g.song_id === s.id).map((g) => g.value),
        })),
        terms.data.map((t) => ({
          dimension: t.dimension as "genre" | "theme" | "mood",
          slug: t.slug,
          labelEn: t.label_en,
        })),
      );
      result = await createAdminClient().rpc("record_ai_tag_suggestions", {
        p_model: ai.ATLAS_AI_MODEL,
        p_prompt_version: TAG_PROMPT_VERSION,
        p_items: suggestions,
      });
    } else if (operation === "undo") {
      result = await db.rpc("undo_catalog_operation", {
        p_operation: id(),
        p_reason: reason(),
      });
    } else throw new Error("invalid operation");
    if (!result) throw new Error("nothing to do");
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
