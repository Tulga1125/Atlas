// A5: summarise a videos.list chart=mostPopular&regionCode=MN response.
// "Looks Mongolian" is a transparent heuristic, never a fact about audiences:
// Mongolian-only Cyrillic letters (ө, ү) in the title or channel name, or a
// Mongolian audio/language tag.

const MONGOLIAN_LETTERS = /[өүӨҮ]/u;

export function looksMongolian(item) {
  const snippet = item?.snippet ?? {};
  const text = `${snippet.title ?? ""} ${snippet.channelTitle ?? ""}`;
  const lang = `${snippet.defaultAudioLanguage ?? ""} ${snippet.defaultLanguage ?? ""}`.toLowerCase();
  return MONGOLIAN_LETTERS.test(text) || /\bmn\b/.test(lang);
}

export function summarise(label, payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const channels = [...new Set(items.map((i) => i?.snippet?.channelTitle).filter(Boolean))].sort();
  const mongolian = items.filter(looksMongolian);
  return {
    label,
    count: items.length,
    channels: channels.length,
    looksMongolian: mongolian.length,
    share: items.length ? Math.round((mongolian.length / items.length) * 100) / 100 : 0,
    sample: mongolian.slice(0, 5).map((i) => ({ id: i.id, title: i.snippet?.title, channel: i.snippet?.channelTitle })),
    meaningful: items.length >= 10 && mongolian.length / Math.max(items.length, 1) >= 0.3,
  };
}
