// Title matching keys for linking platform assets (YouTube videos) to songs.
//
// Mongolian titles appear in Cyrillic, in formal Latin transliteration and in
// informal Latin ("Khairtai", "Hairtai", "Хайртай"). A match key folds all of
// these to one form. Keys are for *suggesting* links: an exact key match only
// auto-links together with a verified channel, and an editor still confirms.
//
// Mirrored in SQL by public.match_title_key / public.strip_title_noise
// (supabase/migrations/20261116001000_youtube_catalog.sql). Keep them in step;
// both are tested against the same pairs.

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z",
  и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", ө: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ү: "u", ф: "f", х: "h", ц: "ts", ч: "ch",
  ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "i", э: "e", ю: "yu", я: "ya",
};

// Phrases that describe the upload rather than the song.
const NOISE =
  "official music video|official lyric video|official video|official audio|official mv|official|music video|lyric video|lyrics video|lyrics|lyric|visualizer|visualiser|audio|video|m/v|mv|hd|4k|клип|дууны үг|албан ёсны|live|концерт";
// JavaScript's \b only knows ASCII letters, so word edges are spelled out.
const B = "(?<![\\p{L}\\p{N}])";
const E = "(?![\\p{L}\\p{N}])";
const NOISE_GROUP = new RegExp(
  `[(\\[【「][^)\\]】」]*${B}(?:${NOISE})${E}[^)\\]】」]*[)\\]】」]`,
  "giu",
);
const NOISE_TAIL = new RegExp(`\\s*[-–—|:]?\\s*${B}(?:${NOISE})${E}\\s*$`, "iu");
const FEATURING = /\s*[([]?\s*\b(?:ft|feat|featuring)\b\.?\s.*$/iu;

/** Lower-case, Latin-only, letters and digits only, no repeated letters. */
export function matchKey(value: string): string {
  let s = value.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");
  s = [...s].map((c) => CYRILLIC[c] ?? c).join("");
  s = s
    .replace(/kh/g, "h")
    .replace(/zh/g, "j")
    .replace(/ts/g, "c")
    .replace(/y([aeiou])/g, "$1")
    .replace(/y/g, "i")
    .replace(/w/g, "v")
    .replace(/q/g, "k")
    .replace(/x/g, "h")
    .replace(/[^a-z0-9]/g, "")
    .replace(/(.)\1+/g, "$1");
  return s;
}

/** Removes upload noise ("(Official MV)", "| 4K", "ft. X") from a title. */
export function stripTitleNoise(title: string): string {
  let s = title.split(/\s[|｜]\s/u)[0];
  s = s.replace(NOISE_GROUP, " ");
  s = s.replace(FEATURING, "");
  for (let i = 0; i < 4; i++) s = s.replace(NOISE_TAIL, "");
  return s.replace(/\s+/g, " ").trim();
}

function splitCredit(value: string) {
  return value
    .split(/\s*(?:,|&|×|(?<![\p{L}\p{N}])(?:x|and|ба)(?![\p{L}\p{N}]))\s*/iu)
    .map(matchKey)
    .filter(Boolean);
}

/**
 * The song-title part of a video title: noise removed and an
 * "Artist - Title" or "Title - Artist" credit dropped when the credit names
 * one of the given artists.
 */
export function videoTitleKey(videoTitle: string, artistNames: string[]) {
  const cleaned = stripTitleNoise(videoTitle);
  const artists = new Set(artistNames.map(matchKey).filter(Boolean));
  const parts = cleaned.split(/\s+[-–—]\s+/u);
  if (parts.length === 2) {
    const [first, second] = parts;
    if (splitCredit(first).some((k) => artists.has(k))) return matchKey(second);
    if (splitCredit(second).some((k) => artists.has(k))) return matchKey(first);
  }
  return matchKey(cleaned);
}

export type TitleMatch = "exact" | "partial" | "none";

export function compareTitles(
  videoTitle: string,
  songTitles: string[],
  artistNames: string[],
): TitleMatch {
  const video = videoTitleKey(videoTitle, artistNames);
  if (!video) return "none";
  const songs = songTitles.map((t) => matchKey(stripTitleNoise(t))).filter(Boolean);
  if (songs.includes(video)) return "exact";
  if (
    songs.some(
      (song) =>
        Math.min(song.length, video.length) >= 4 &&
        (song.includes(video) || video.includes(song)),
    )
  )
    return "partial";
  return "none";
}
