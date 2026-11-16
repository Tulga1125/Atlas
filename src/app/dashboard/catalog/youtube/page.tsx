import Link from "next/link";
import { OperationsShell } from "@/components/operations/shell";
import { WorkflowForm } from "@/components/operations/workflow-form";
import { staffContext } from "@/modules/operations/data";
import { getLocale } from "@/modules/i18n/server";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { label } from "@/modules/operations/labels";
import { assetKinds, countingKinds, videoUrl } from "@/modules/youtube/video";
import { z } from "zod";

export const metadata = { title: "YouTube videos" };

const YOUTUBE = "00000000-0000-0000-0000-000000000002";
const tabs = ["queue", "linked", "rejected"] as const;
type Tab = (typeof tabs)[number];

const evidenceSchema = z
  .object({
    titleMatch: z.enum(["exact", "partial", "none"]).optional(),
    verifiedChannel: z.boolean().optional(),
    autoLinked: z.boolean().optional(),
  })
  .passthrough();

function duration(seconds: number | null) {
  if (seconds === null) return "—";
  const h = Math.floor(seconds / 3600),
    m = Math.floor((seconds % 3600) / 60),
    s = seconds % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function filtered<T extends { or: (f: string) => T; eq: (c: string, v: string) => T }>(
  query: T,
  tab: Tab,
) {
  if (tab === "queue")
    return query.or(
      "link_status.eq.candidate,and(link_status.eq.linked,verification.neq.verified)",
    );
  if (tab === "linked")
    return query.eq("link_status", "linked").eq("verification", "verified");
  return query.eq("link_status", "rejected");
}

export default async function YouTubeCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const context = await staffContext();
  const locale = await getLocale();
  const copy = getDictionary(locale).youtubeCatalog;
  const t = (key: string) => label(key, locale);
  const requested = (await searchParams).tab;
  const tab: Tab = tabs.includes(requested as Tab) ? (requested as Tab) : "queue";
  const db = context.db;
  const editable = ["administrator", "data_editor"].includes(context.profile.role);

  const [videos, ...counts] = await Promise.all([
    filtered(
      db
        .from("youtube_video_assets")
        .select(
          "*, platform_assets!youtube_video_assets_platform_asset_id_fkey(platform_title,platform_artist_name,artwork_url,recording_id)",
        ),
      tab,
    )
      .order("created_at", { ascending: false })
      .limit(100),
    ...tabs.map((name) =>
      filtered(
        db
          .from("youtube_video_assets")
          .select("platform_asset_id", { count: "exact", head: true }),
        name,
      ),
    ),
  ]);
  if (videos.error) throw new Error("YouTube catalogue unavailable");
  const rows = videos.data ?? [];
  const ids = rows.map((r) => r.platform_asset_id);
  const channels = [...new Set(rows.map((r) => r.channel_id))];

  const [reviews, profiles, watch, songs] = await Promise.all([
    ids.length
      ? db
          .from("entity_match_reviews")
          .select("platform_asset_id,suggested_recording_id,confidence,evidence,status,created_at")
          .in("platform_asset_id", ids)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    channels.length
      ? db
          .from("artist_platform_profiles")
          .select("platform_artist_id,artists(canonical_name)")
          .eq("platform_id", YOUTUBE)
          .eq("match_status", "verified")
          .in("platform_artist_id", channels)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? db.from("youtube_watchlist").select("platform_asset_id,active").in("platform_asset_id", ids)
      : Promise.resolve({ data: [], error: null }),
    db
      .from("songs")
      .select("id,canonical_title,recordings(id,version_name,recording_type)")
      .is("redirect_to", null)
      .order("canonical_title")
      .limit(1000),
  ]);
  if (reviews.error || profiles.error || watch.error || songs.error)
    throw new Error("YouTube catalogue unavailable");

  const latestReview = new Map<string, (typeof reviews.data)[number]>();
  for (const review of reviews.data ?? [])
    if (!latestReview.has(review.platform_asset_id))
      latestReview.set(review.platform_asset_id, review);
  const verified = new Map<string, string[]>();
  for (const p of profiles.data ?? [])
    verified.set(p.platform_artist_id, [
      ...(verified.get(p.platform_artist_id) ?? []),
      p.artists?.canonical_name ?? "",
    ]);
  const watching = new Map((watch.data ?? []).map((w) => [w.platform_asset_id, w.active]));
  const recordingOptions = (songs.data ?? []).flatMap((song) =>
    song.recordings.map((r) => ({
      value: r.id,
      label: `${song.canonical_title}${r.version_name ? ` · ${r.version_name}` : r.recording_type !== "original" ? ` · ${r.recording_type}` : ""}`,
    })),
  );
  const songByRecording = new Map(recordingOptions.map((o) => [o.value, o.label]));
  const kindOptions = assetKinds.map((k) => ({ value: k, label: copy.kinds[k] }));

  return (
    <OperationsShell section="catalog" currentPath="/dashboard/catalog/youtube">
      <header className="youtube-catalog__header">
        <h2>{copy.title}</h2>
        <p>{copy.intro}</p>
        <nav className="youtube-catalog__tabs" aria-label={copy.title}>
          {tabs.map((name, i) => (
            <Link
              key={name}
              href={`/dashboard/catalog/youtube?tab=${name}`}
              aria-current={name === tab ? "page" : undefined}
            >
              {copy.tabs[name]} <span>{counts[i].count ?? 0}</span>
            </Link>
          ))}
        </nav>
      </header>

      {editable && (
        <details className="youtube-catalog__add">
          <summary>{copy.addTitle}</summary>
          <p>{copy.addHelp}</p>
          <WorkflowForm
            hidden={{ operation: "youtube-add" }}
            fields={[
              { name: "url", label: copy.addUrl, type: "url", required: true },
              { name: "reason", label: t("reason"), type: "textarea", required: true },
            ]}
            button={copy.addButton}
          />
        </details>
      )}

      {rows.length === 0 && <p className="data-notice">{copy.empty}</p>}
      <div className="youtube-catalog__list">
        {rows.map((video) => {
          const asset = video.platform_assets;
          const review = latestReview.get(video.platform_asset_id);
          const evidence = evidenceSchema.safeParse(review?.evidence).data;
          const artists = verified.get(video.channel_id);
          const awaiting = video.link_status === "linked" && video.verification !== "verified";
          const kind = video.asset_kind ?? video.suggested_kind;
          const linkedRecording = asset?.recording_id ?? null;
          const suggested = review?.suggested_recording_id ?? null;
          const purged = !!video.metadata_purged_at && asset?.platform_title === video.video_id;
          const actions = (
            video.link_status === "candidate"
              ? ["link", "reject"]
              : video.link_status === "rejected"
                ? ["link"]
                : awaiting
                  ? ["confirm", "link", "unlink", "reject", "kind"]
                  : ["primary", "kind", "link", "unlink", "reject"]
          ) as (keyof typeof copy.actions)[];
          return (
            <article key={video.platform_asset_id} className="youtube-video" data-video-id={video.video_id}>
              <a
                className="youtube-video__thumb"
                href={videoUrl(video.video_id)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={copy.openOnYouTube}
              >
                {asset?.artwork_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.artwork_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                  <span aria-hidden="true">▶</span>
                )}
              </a>
              <div className="youtube-video__body">
                <h3>
                  <a href={videoUrl(video.video_id)} target="_blank" rel="noopener noreferrer">
                    {asset?.platform_title ?? video.video_id}
                  </a>
                </h3>
                {purged && <p className="youtube-video__note">{copy.metadataPurged}</p>}
                <ul className="youtube-video__meta">
                  <li>
                    {asset?.platform_artist_name ?? video.channel_id}{" "}
                    <span className={artists ? "yt-badge yt-badge--verified" : "yt-badge"}>
                      {artists ? `${copy.verifiedChannel} · ${artists.join(", ")}` : copy.unverifiedChannel}
                    </span>
                  </li>
                  <li>
                    {copy.duration}: {duration(video.duration_seconds)}
                    {video.is_short && <span className="yt-badge"> {copy.short}</span>}
                  </li>
                  <li>
                    {copy.published}: {video.published_at?.slice(0, 10) ?? "—"}
                  </li>
                  <li>{copy.source[video.discovery_source]}</li>
                </ul>
                <p className="youtube-video__status">
                  {awaiting && <span className="yt-badge yt-badge--alert">{copy.autoLinked}</span>}
                  {video.is_primary && <span className="yt-badge yt-badge--primary">{copy.primary}</span>}
                  {kind && (
                    <span className="yt-badge">
                      {copy.kinds[kind]} ·{" "}
                      {countingKinds.includes(kind) ? copy.counts : copy.doesNotCount}
                    </span>
                  )}
                  {video.link_status === "linked" && (
                    <span className="yt-badge">
                      {watching.get(video.platform_asset_id) ? copy.watching : copy.paused}
                    </span>
                  )}
                </p>
                <dl className="youtube-video__suggestion">
                  <div>
                    <dt>{linkedRecording ? copy.linkedTo : copy.suggestion}</dt>
                    <dd>
                      {linkedRecording
                        ? (songByRecording.get(linkedRecording) ?? linkedRecording)
                        : suggested
                          ? (songByRecording.get(suggested) ?? suggested)
                          : copy.noSuggestion}
                    </dd>
                  </div>
                  {review?.confidence != null && (
                    <div>
                      <dt>{copy.confidence}</dt>
                      <dd>{Math.round(Number(review.confidence) * 100)}%</dd>
                    </div>
                  )}
                  {evidence?.titleMatch && (
                    <div>
                      <dt>{t("evidence")}</dt>
                      <dd>
                        {copy.titleMatch[evidence.titleMatch]} ·{" "}
                        {evidence.verifiedChannel ? copy.verifiedChannel : copy.unverifiedChannel}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
              <WorkflowForm
                hidden={{ operation: "youtube-review", id: video.platform_asset_id }}
                fields={[
                  {
                    name: "action",
                    label: copy.action,
                    type: "select",
                    options: actions.map((a) => ({ value: a, label: copy.actions[a] })),
                  },
                  {
                    name: "recording",
                    label: copy.recording,
                    type: "select",
                    value: linkedRecording ?? suggested ?? "",
                    options: [{ value: "", label: "—" }, ...recordingOptions],
                  },
                  {
                    name: "kind",
                    label: copy.kind,
                    type: "select",
                    value: kind ?? "other",
                    options: kindOptions,
                  },
                  { name: "reason", label: t("reason"), type: "textarea", required: true },
                ]}
                button={t("save")}
                disabled={!editable}
              />
              {video.link_status === "linked" && (
                <WorkflowForm
                  hidden={{
                    operation: "youtube-watch",
                    id: video.platform_asset_id,
                    active: watching.get(video.platform_asset_id) ? "off" : "on",
                  }}
                  fields={[{ name: "reason", label: t("reason"), type: "textarea", required: true }]}
                  button={watching.get(video.platform_asset_id) ? copy.watchOff : copy.watchOn}
                  disabled={!editable}
                />
              )}
            </article>
          );
        })}
      </div>
    </OperationsShell>
  );
}
