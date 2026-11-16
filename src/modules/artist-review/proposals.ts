import { matchKey, stripTitleNoise } from "@/modules/catalog/match-title";

// Artist approval queue (artist-queue-v1): pure rules that turn a new Apple
// chart credit into a proposal for a person to approve. Nothing here links or
// merges anything; the dashboard does that after a click.

/** Title key that ignores featured credits, "/live session/" notes and soft signs. */
export function looseKey(title: string) {
  return matchKey(stripTitleNoise(title
    .replace(/\s*[([](?:feat|ft|with)\.?[^)\]]*[)\]]/giu, "")
    .replace(/\s*\/[^/]*\/\s*/gu, " ")
    .replace(/[ьЬъЪ]/gu, "")));
}

/** "A & B", "A, B", "A x B" → ["A", "B"]. */
export function splitCredit(name: string) {
  return name
    .split(/\s*(?:&|,|\s[xX×]\s|\sfeat\.?\s|\sft\.?\s)\s*/u)
    .map((p) => p.trim())
    .filter(Boolean);
}

export type KnownArtist = { id: string; names: string[] };

/** Index of verified Mongolian artists by every name key. */
export function indexArtists(artists: KnownArtist[]) {
  const index = new Map<string, string>();
  for (const a of artists) for (const n of a.names) { const k = matchKey(n); if (k) index.set(k, a.id); }
  return index;
}

export type CreditMatch =
  | { kind: "merge"; target: string; coArtists: string[]; unresolved: string[] }
  | { kind: "unknown"; parts: string[] };

/** Matches a chart credit to known artists by exact name or alias. */
export function matchCredit(name: string, index: Map<string, string>): CreditMatch {
  const parts = splitCredit(name);
  const ids = parts.map((p) => index.get(matchKey(p)) ?? null);
  if (ids[0]) {
    return {
      kind: "merge",
      target: ids[0],
      coArtists: [...new Set(ids.slice(1).filter((i): i is string => !!i && i !== ids[0]))],
      unresolved: parts.filter((_, i) => !ids[i]),
    };
  }
  return { kind: "unknown", parts };
}

export type ChannelCandidate = {
  channelId: string;
  title: string;
  handle: string | null;
  country: string | null;
  subscribers: number;
  videos: number;
  uploadTitles: string[];
};

/** Evidence that a channel belongs to the credited artist. */
export function channelEvidence(name: string, chartSongs: string[], channel: ChannelCandidate) {
  const nameKey = matchKey(name);
  const titleKey = matchKey(channel.title.replace(/\s*-\s*Topic$/i, ""));
  const nameMatches = !!nameKey && (titleKey === nameKey || titleKey.includes(nameKey) || nameKey.includes(titleKey));
  const uploads = channel.uploadTitles.map(looseKey);
  const matchedSongs = chartSongs.filter((s) => {
    const k = looseKey(s);
    return k.length >= 2 && uploads.some((u) => u === k || (k.length >= 4 && u.includes(k)));
  });
  return { nameMatches, matchedSongs, topic: / - Topic$/i.test(channel.title) };
}

/** The best channel: a matching name with a chart song in its uploads first. */
export function pickChannel(name: string, chartSongs: string[], channels: ChannelCandidate[], minSubscribers: number) {
  const scored = channels
    .filter((c) => !/ - Topic$/i.test(c.title)) // Topic channels hold audio only; prefer the artist's own
    .map((c) => ({ c, e: channelEvidence(name, chartSongs, c) }))
    .filter(({ c, e }) => e.nameMatches && (e.matchedSongs.length > 0 || c.subscribers >= minSubscribers))
    .sort((a, b) => b.e.matchedSongs.length - a.e.matchedSongs.length || b.c.subscribers - a.c.subscribers || a.c.channelId.localeCompare(b.c.channelId));
  const best = scored[0];
  if (!best) return null;
  return { channel: best.c, ...best.e, confidence: best.e.matchedSongs.length > 0 ? ("strong" as const) : ("name_only" as const) };
}
