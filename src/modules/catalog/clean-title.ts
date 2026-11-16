import { matchKey } from "./match-title";

// Song titles taken from YouTube upload titles carry upload notes: artist
// credits, "// PROD BY …", "/Official Music Video/", "@handles", emojis, OST
// and TV-series tags, unbalanced quotes. cleanSongTitle keeps the song's own
// name (and real version words such as "Remix" or "Acoustic"); the old title
// is kept as an alias so matching still finds it. Pure; tested beside it.

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
const NOISE_WORDS =
  "official music video|official lyrics? video|official video|official audio|official mv|offical music video|offical video|music video|lyrics? video|visuali[sz]er|official|offical|m\\/v|mv(?: \\d{4})?|4k|hd|клип|дууны үг|lyrics?";
const NOTE_SEGMENT = new RegExp(`\\s*[/|｜]\\s*(?:${NOISE_WORDS}|prod\\.?\\s*by[^/|]*)\\s*[/|｜]`, "giu");
const NOTE_GROUP = new RegExp(`\\s*[(\\[]\\s*(?:${NOISE_WORDS}|[^)\\]]*\\b(?:ost|soundtrack|album)\\b[^)\\]]*)\\s*[)\\]]`, "giu");
const PROD = /\s*[(\[/]?\s*\bprod(?:uced)?\.?\s*(?:by)?\.?\s*[^)\]/|]*[)\]/]?/giu;
const EPISODE = /\s*[-–—]\s*[^-–—()]+\(\s*S\d+\s*:\s*E\d+\s*\)\s*$|\s*\(\s*S\d+\s*:\s*E\d+\s*\)/giu;
const OST_TAIL = /\s*[-–—]\s*[^-–—]*\bOST\b\s*$|\s+(?:OST|ОСТ)\s*$/iu;
const HANDLE = /\s*@[\p{L}\p{N}_.]+/gu;
const PIN = /\s*📍.*$/u;

const escape = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function stripArtistPrefix(title: string, artistNames: string[]) {
  // Longest names first, so "O.G MOB x 113" is judged on "O.G MOB", not "O.G".
  const names = [...new Set(artistNames)].filter((n) => matchKey(n)).sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (!new RegExp(`^\\s*${escape(name)}(?![\\p{L}\\p{N}])`, "iu").test(title)) continue;
    // "113 AIDAS", "B Tamir -MC Killa", "290 ~ Intro", "The Royal Heartaches • Enelel".
    // Not when a collaborator follows ("Bold & Uka …", "O.G MOB x 113").
    const re = new RegExp(`^\\s*${escape(name)}\\s*(?:[-–—:•~|]\\s*|\\s+(?![&x×,]\\s|X\\s))`, "iu");
    if (!re.test(title)) return title;
    const rest = title.replace(re, "").trim();
    return matchKey(rest).length >= 2 ? rest : title;
  }
  for (const name of names) {
    // "SPEED 290": the artist's name at the end, unless it is a joint credit ("A & B Tamir").
    const tail = new RegExp(`(?<![&x×,]\\s*)\\s+[-–—~•]?\\s*${escape(name)}\\s*$`, "iu");
    if (tail.test(title)) {
      const rest = title.replace(tail, "").trim();
      if (matchKey(rest).length >= 2 && !/[&,x×]$/iu.test(rest)) return rest;
    }
  }
  return title;
}

/** "111221 -ARMAN BAKHYTBYEK, SEKSTSAGAANBOGD": a trailing credit list naming the artist. */
function stripArtistTail(title: string, artistNames: string[]) {
  const parts = title.split(/\s+[-–—]\s*/u);
  if (parts.length < 2) return title;
  const last = matchKey(parts[parts.length - 1]);
  const named = artistNames.some((n) => { const k = matchKey(n); return k.length >= 3 && last.includes(k); });
  const rest = parts.slice(0, -1).join(" - ").trim();
  return named && matchKey(rest).length >= 2 ? rest : title;
}

function balanceQuotes(title: string) {
  const straight = (title.match(/"/g) ?? []).length;
  let t = title;
  if (straight % 2 === 1) t = t.replace(/"/g, "");
  const curlyOpen = (t.match(/[“«]/g) ?? []).length, curlyClose = (t.match(/[”»]/g) ?? []).length;
  if (curlyOpen !== curlyClose) t = t.replace(/[“”«»]/g, "");
  return t.replace(/^["“«]\s*(.*?)\s*["”»]$/u, "$1");
}

export function cleanSongTitle(raw: string, artistNames: string[] = []) {
  let t = raw.normalize("NFC");
  // A run of emojis inside a title separates the song from credits.
  // Keycap digits ("2️⃣9️⃣0️⃣") are digits.
  t = t.replace(PIN, "").replace(/(\d)\u{FE0F}?\u{20E3}/gu, "$1");
  t = t.replace(/\s*[\p{Extended_Pictographic}\u{FE0F}\u{200D}]+\s*(?=\S)/gu, " // ").replace(EMOJI, " ");
  // "A // B": the part before the separator is the song, unless it is only the artist.
  const parts = t.split(/\s*(?:\/\/|\s\|\s|｜)\s*/u).filter((p) => p.trim() && matchKey(p).length > 0);
  if (parts.length > 1) {
    const first = stripArtistPrefix(parts[0], artistNames);
    t = matchKey(first).length >= 2 && artistNames.every((n) => matchKey(first) !== matchKey(n)) ? parts[0] : parts[1];
    // "AMIDRAL // ICEMAN REMIX" is a version: keep it in brackets.
    const version = parts.slice(1).find((p) => /\b(remix|acoustic|version|mix|edit)\b/iu.test(p));
    if (version && t === parts[0]) t = `${t} (${version.trim()})`;
  }
  t = t.replace(NOTE_SEGMENT, " ").replace(/\s*\|[^|]*\|\s*$/u, " ").replace(NOTE_GROUP, " ").replace(PROD, " ");
  // A trailing "/…/" note: a remix stays as "(Remix)", anything else (album, credits, year) goes.
  // Only a closed "/…/" or one opened by " / "; never inside brackets ("Demo / Unmastered)") or "w/o".
  t = t.replace(/(?:\s+\/\s*([^/()]*?)\s*\/?|\/\s*([^/()]*?)\s*\/)\s*$/u, (m, a: string | undefined, b: string | undefined) => {
    const note = a ?? b ?? "";
    if (/\bremix\b/iu.test(note)) return ` (${note})`;
    return /[\p{L}]/u.test(t.slice(0, t.length - m.length)) ? "" : m;
  });
  t = t.replace(/\s+[\p{Lu}\p{N}]+\s+ALBUM\s*$/u, "");
  t = t.replace(EPISODE, "").replace(OST_TAIL, "").replace(HANDLE, " ");
  t = stripArtistTail(stripArtistPrefix(t, artistNames), artistNames);
  t = balanceQuotes(t).replace(/^['‘’`]+/u, "");
  t = t.replace(/\(\s*\)|\[\s*\]/g, " ").replace(/\s+/g, " ").replace(/^[\s\-–—:|/]+|[\s\-–—:|/]+$/gu, "").trim();
  return t.length >= 1 ? t : raw.trim();
}

/** Upload titles that describe something other than a song (for an editor to remove). */
export function looksLikeNotASong(title: string) {
  return /\b(episode \d+|anniversary|concert|hip ?hop show|promotion video|review|unbox|#uncage|tiger brand|trailer|teaser|interview|behind (?:the )?scenes?|vlog|giveaway|documentary|after movie|invites a fan|box set|performed by|message|world children)\b/iu.test(title)
    || /баримтат кино|пянз|\bvolume\.?\s?\d/iu.test(title)
    || /\d{4}\.\d{2}\.\d{2}/.test(title);
}
