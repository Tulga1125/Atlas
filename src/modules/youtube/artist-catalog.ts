import { matchKey, stripTitleNoise, videoTitleKey } from "../catalog/match-title";
import { cleanSongTitle, looksLikeNotASong } from "../catalog/clean-title";
import type { CandidateVideo } from "./discovery";

// Builds an artist's song list from the uploads of their own YouTube channel
// (owner-approved channels only). Pure: the script fetches, the database
// function `import_youtube_artist_catalog` stores.
//
// * One song per distinct title key. The song is created from one upload
//   (its "source video"), so that video is linked by construction.
// * Other uploads with the same title key (lyric video, audio, live) are
//   linked as suggestions under the A2 auto-link rule (verified channel +
//   exact title) and wait for an editor.
// * Shorts, teasers, interviews, vlogs, full albums and similar are skipped
//   with a reason; nothing is invented for them.

export type ImportArtist = {
  name: string;
  channelId: string;
  aliases: string[];
  /** Label channel: only uploads that credit the artist by name count. */
  isLabel: boolean;
  /** Members of a group (owner-confirmed): their solo uploads on the group's channel are credited to them. */
  members?: { name: string; aliases: string[]; artistId: string }[];
};

export type SongVideo = CandidateVideo & { role: "source" | "version" };
export type ImportSong = {
  key: string;
  title: string;
  credit: "primary" | "featured";
  releaseDate: string | null;
  /** Set when the song belongs to a member rather than the channel artist. */
  artistId?: string;
  videos: SongVideo[];
};
export type SkippedVideo = { videoId: string; title: string; reason: string };

const NOT_A_SONG =
  /(?<![\p{L}\p{N}])(?:teaser|trailer|interview|ярилцлага|behind the scenes?|bts|vlog|podcast|reaction|challenge|making of|announcement|preview|snippet|tutorial|livestream|live stream|full album|album stream|full ep|playlist|compilation|mixtape stream|unboxing|q&a|шинэ жилийн мэнд|мэндчилгээ|trailer)(?![\p{L}\p{N}])/iu;

const MIN_SECONDS = 90;
const MAX_SECONDS = 900;
const KIND_ORDER = ["official_music_video", "official_audio", "lyric_video", "other", "live"] as const;

/** Ulaanbaatar calendar date of a timestamp. */
export function ulaanbaatarDate(iso: string | null) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t + 8 * 3_600_000).toISOString().slice(0, 10);
}

function names(artist: ImportArtist) {
  return [artist.name, ...artist.aliases];
}

function mentions(text: string, artist: ImportArtist) {
  const key = matchKey(text);
  // Whole credits match at any length ("113"); inside longer text only names
  // of at least three letters do, so "OG" does not match "OG BRO".
  const credits = new Set(
    text.split(/\s*(?:[,&×/@|()[\]-]|(?<![\p{L}\p{N}])(?:x|and|ба|ft|feat|featuring|with)\.?(?![\p{L}\p{N}]))\s*/iu).map(matchKey).filter(Boolean),
  );
  return names(artist).some((n) => {
    const k = matchKey(n);
    return credits.has(k) || (k.length >= 3 && key.includes(k));
  });
}

/** Display title of the song in an upload title, or null when there is none. */
export function songTitle(videoTitle: string, artist: ImportArtist) {
  const cleaned = stripTitleNoise(videoTitle);
  const parts = cleaned.split(/\s+[-–—]\s+/u);
  let title = cleaned;
  if (parts.length >= 2) {
    // "Artist - Title": the credit is the part that names the artist; with no
    // name in either part, the first part is the credit by convention.
    const creditIndex = mentions(parts[0], artist) ? 0 : mentions(parts[parts.length - 1], artist) ? parts.length - 1 : 0;
    title = parts.filter((_, i) => i !== creditIndex).join(" - ");
  }
  title = title
    .replace(/\s*[([][^)\]]*\b(?:prod|produced)\b[^)\]]*[)\]]/giu, "")
    .replace(/\s*\((?:no promo)\)/giu, "")
    .replace(/\s+(?:prod\.?|produced)\s*(?:by\.?)?\s+\S.*$/iu, "")
    .replace(/^["'“”«»]+|["'“”«»]+$/gu, "").replace(/\s+/g, " ").trim();
  title = cleanSongTitle(title, names(artist));
  return title.length >= 1 && title.length <= 240 ? title : null;
}

export function classifyUploads(artist: ImportArtist, videos: CandidateVideo[]) {
  const skipped: SkippedVideo[] = [];
  const groups = new Map<string, { title: string; credit: ImportSong["credit"]; artistId?: string; videos: CandidateVideo[] }>();
  for (const v of [...videos].sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? "") || a.videoId.localeCompare(b.videoId))) {
    const skip = (reason: string) => skipped.push({ videoId: v.videoId, title: v.title, reason });
    if (v.channelId !== artist.channelId) { skip("other_channel"); continue; }
    if (v.isShort) { skip("short"); continue; }
    if (v.durationSeconds === null || v.durationSeconds < MIN_SECONDS) { skip("too_short_or_unknown_length"); continue; }
    if (v.durationSeconds > MAX_SECONDS) { skip("too_long_for_a_song"); continue; }
    if (NOT_A_SONG.test(v.title) || looksLikeNotASong(v.title)) { skip("not_a_song"); continue; }
    if (artist.isLabel && !mentions(v.title, artist)) { skip("label_upload_by_another_artist"); continue; }
    // "Someone Else - Title" on the artist's channel is someone else's song.
    // A member named instead takes the credit (solo song on the group's channel).
    let owner: ImportArtist = artist;
    let ownerId: string | undefined;
    if (stripTitleNoise(v.title).split(/\s+[-–—]\s+/u).length >= 2 && !mentions(v.title, artist)) {
      const member = artist.members?.find((m) => mentions(v.title, { ...artist, name: m.name, aliases: m.aliases }));
      if (!member) { skip("credited_to_another_artist"); continue; }
      owner = { ...artist, name: member.name, aliases: member.aliases };
      ownerId = member.artistId;
    }
    const title = songTitle(v.title, owner);
    const key = title ? videoTitleKey(v.title, names(owner)) : "";
    if (!title || !key) { skip("no_title"); continue; }
    const group = groups.get(key);
    if (group) { group.videos.push(v); continue; }
    if (v.suggestedKind === "live") { skip("live_without_studio_version"); continue; }
    // Primary when the credit names the artist or names nobody (own upload);
    // featured when only a "ft." mention names them.
    const credit = stripTitleNoise(v.title).split(/\s+[-–—]\s+/u).length >= 2 && !mentions(stripTitleNoise(v.title), owner) && mentions(v.title, owner)
      ? "featured" : "primary";
    groups.set(key, { title, credit, artistId: ownerId, videos: [v] });
  }

  const songs: ImportSong[] = [...groups.entries()].map(([key, g]) => {
    // The source video: the most official kind, then the earliest.
    const source = [...g.videos].sort((a, b) =>
      KIND_ORDER.indexOf(a.suggestedKind) - KIND_ORDER.indexOf(b.suggestedKind) ||
      (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""))[0];
    const earliest = g.videos.map((v) => v.publishedAt).filter((p): p is string => !!p).sort()[0] ?? null;
    return {
      key,
      title: g.title,
      credit: g.credit,
      ...(g.artistId ? { artistId: g.artistId } : {}),
      releaseDate: ulaanbaatarDate(earliest),
      videos: g.videos.map((v) => ({ ...v, role: v.videoId === source.videoId ? "source" : "version" })),
    };
  });
  songs.sort((a, b) => (a.releaseDate ?? "").localeCompare(b.releaseDate ?? "") || a.key.localeCompare(b.key));
  return { songs, skipped };
}
