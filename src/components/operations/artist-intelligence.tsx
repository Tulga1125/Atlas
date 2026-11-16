import Link from "next/link";
import { staffContext } from "@/modules/operations/data";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { label } from "@/modules/operations/labels";
import type { Locale } from "@/modules/i18n/config";
import { ArtistYouTubePanel } from "@/components/youtube/youtube-panels";

/** Staff-only additions to the artist page (C2, spec §11.6). */
export async function ArtistIntelligence({ artistId, locale }: { artistId: string; locale: Locale }) {
  const { db } = await staffContext();
  const copy = getDictionary(locale).artistPage;
  const t = (key: string) => label(key, locale);
  const credits = await db.from("song_artists").select("song_id,songs(canonical_title,redirect_to)").eq("artist_id", artistId);
  if (credits.error) throw new Error("Artist intelligence unavailable");
  const songs = credits.data.filter((c) => !c.songs?.redirect_to).map((c) => ({ id: c.song_id, title: c.songs?.canonical_title ?? c.song_id }));
  const ids = songs.map((s) => s.id);
  const none = { data: [], error: null };
  const [tags, signals, recordings] = await Promise.all([
    ids.length ? db.from("song_context_tags").select("id,song_id,status,context_terms(dimension,label_mn,label_en)").in("song_id", ids) : Promise.resolve(none),
    db
      .from("signals")
      .select("id,signal_type,headline_summary,status,detected_at,song_id")
      .or(ids.length ? `artist_id.eq.${artistId},song_id.in.(${ids.join(",")})` : `artist_id.eq.${artistId}`)
      .order("detected_at", { ascending: false })
      .limit(15),
    ids.length ? db.from("recordings").select("id,song_id").in("song_id", ids) : Promise.resolve(none),
  ]);
  if (tags.error || signals.error || recordings.error) throw new Error("Artist intelligence unavailable");
  const recordingIds = (recordings.data ?? []).map((r) => r.id);
  const videos = recordingIds.length
    ? await db
        .from("platform_assets")
        .select("id,recording_id")
        .eq("platform_id", "00000000-0000-0000-0000-000000000002")
        .in("recording_id", recordingIds)
    : none;
  if (videos.error) throw new Error("YouTube coverage unavailable");
  const videoIds = (videos.data ?? []).map((v) => v.id);
  const watched = videoIds.length
    ? await db.from("youtube_watchlist").select("platform_asset_id").eq("active", true).in("platform_asset_id", videoIds)
    : none;
  if (watched.error) throw new Error("YouTube coverage unavailable");
  const songOfRecording = new Map((recordings.data ?? []).map((r) => [r.id, r.song_id]));
  const recordingOfVideo = new Map((videos.data ?? []).map((v) => [v.id, v.recording_id ?? ""]));
  const watchedSongs = new Set(
    (watched.data ?? []).map((w) => songOfRecording.get(recordingOfVideo.get(w.platform_asset_id) ?? "")).filter(Boolean),
  );
  const verified = new Map<string, Set<string>>();
  for (const tag of tags.data ?? [])
    if (tag.status === "verified" && tag.context_terms) {
      if (!verified.has(tag.song_id)) verified.set(tag.song_id, new Set());
      verified.get(tag.song_id)!.add(tag.context_terms.dimension);
    }
  const untagged = songs.filter((s) => !(verified.get(s.id)?.has("genre") && verified.get(s.id)?.has("theme")));
  const pending = (tags.data ?? []).filter((x) => x.status === "suggested");
  const disputes = (tags.data ?? []).filter((x) => x.status === "disputed");
  const title = new Map(songs.map((s) => [s.id, s.title]));
  const term = (x: { context_terms: { label_mn: string; label_en: string } | null }) =>
    x.context_terms ? (locale === "mn" ? x.context_terms.label_mn : x.context_terms.label_en) : "";
  const list = (items: { key: string; href: string; text: string; note?: string }[]) =>
    items.length === 0 ? (
      <p className="artist-panel-empty">{copy.none}</p>
    ) : (
      <ul className="artist-link-list">
        {items.map((i) => (
          <li key={i.key}>
            <Link href={i.href}>{i.text}</Link>
            {i.note && <small>{i.note}</small>}
          </li>
        ))}
      </ul>
    );
  return (
    <section className="artist-scene" aria-labelledby="artist-intelligence-title">
      <h2 id="artist-intelligence-title">{copy.intelligence}</h2>
      <ArtistYouTubePanel db={db} artistId={artistId} locale={locale} />
      <div className="artist-intelligence-grid">
        <article className="artist-source-panel">
          <header><p className="eyebrow">{copy.untagged}</p></header>
          {list(untagged.map((s) => ({ key: s.id, href: "/dashboard/catalog/tags", text: s.title })))}
        </article>
        <article className="artist-source-panel">
          <header><p className="eyebrow">{copy.pendingTags}</p></header>
          {list(pending.map((p) => ({ key: p.id, href: "/dashboard/catalog/tags", text: `${title.get(p.song_id) ?? ""}: ${term(p)}` })))}
        </article>
        <article className="artist-source-panel">
          <header><p className="eyebrow">{copy.disputes}</p></header>
          {list(disputes.map((p) => ({ key: p.id, href: "/dashboard/catalog/tags", text: `${title.get(p.song_id) ?? ""}: ${term(p)}` })))}
        </article>
        <article className="artist-source-panel">
          <header><p className="eyebrow">{copy.signalsLeads}</p></header>
          {list((signals.data ?? []).map((s) => ({ key: s.id, href: "/dashboard/signals", text: s.headline_summary, note: `${s.signal_type} · ${t(s.status)} · ${s.detected_at.slice(0, 10)}` })))}
        </article>
        <article className="artist-source-panel">
          <header><p className="eyebrow">{copy.youtubeCoverage}</p></header>
          <p>
            {copy.youtubeCoverageLine.replace("{watched}", String(watchedSongs.size)).replace("{songs}", String(songs.length))}
          </p>
          <Link href="/dashboard/catalog/youtube" className="text-link">YouTube →</Link>
        </article>
      </div>
    </section>
  );
}
