import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// AI tag suggestions (owner decision D8). Suggestions only: an editor confirms
// every tag. Inputs are metadata Atlas may hold (title, credits, source genres,
// editor notes) and never lyrics. Output is validated against the vocabulary;
// anything unknown is dropped.

export const TAG_PROMPT_VERSION = "context-tags-v1";

export type TagSong = {
  songId: string;
  title: string;
  artists: string[];
  sourceGenres: string[];
  editorNote?: string | null;
};
export type Vocabulary = { dimension: "genre" | "theme" | "mood"; slug: string; labelEn: string }[];
export type AiSuggestion = { songId: string; dimension: "genre" | "theme" | "mood"; term: string; note: string };

const outputSchema = z.object({
  suggestions: z.array(
    z.object({
      songId: z.string(),
      dimension: z.enum(["genre", "theme", "mood"]),
      term: z.string(),
      reason: z.string(),
    }),
  ),
});

export function buildTagPrompt(songs: TagSong[], vocabulary: Vocabulary) {
  const terms = (["genre", "theme", "mood"] as const)
    .map((d) => `${d}: ${vocabulary.filter((v) => v.dimension === d).map((v) => `${v.slug} (${v.labelEn})`).join(", ")}`)
    .join("\n");
  const items = songs
    .map((s) =>
      JSON.stringify({
        songId: s.songId,
        title: s.title,
        artists: s.artists,
        sourceGenres: s.sourceGenres,
        editorNote: s.editorNote ?? null,
      }),
    )
    .join("\n");
  return `You help editors of Atlas Charts, a Mongolian music chart, tag songs. For each song below, suggest at most two genre terms, two theme terms and one mood term, using only the slugs listed. Base suggestions only on the metadata given (title, credited artists, source genres from Apple Music, editor notes). Do not use or quote lyrics. Do not describe the artists themselves, and never infer anyone's religion, ethnicity, politics or other personal traits. If the metadata gives no real basis for a dimension, suggest nothing for it; an editor will decide. Keep each reason to one short sentence stating what in the metadata supports it.

Allowed terms:
${terms}

Songs (one JSON object per line):
${items}`;
}

/** Keeps only suggestions for the songs asked about and terms in the vocabulary. */
export function filterSuggestions(raw: z.infer<typeof outputSchema>["suggestions"], songs: TagSong[], vocabulary: Vocabulary): AiSuggestion[] {
  const songIds = new Set(songs.map((s) => s.songId));
  const allowed = new Set(vocabulary.map((v) => `${v.dimension}:${v.slug}`));
  const seen = new Set<string>();
  const out: AiSuggestion[] = [];
  for (const s of raw) {
    const key = `${s.songId}:${s.dimension}:${s.term}`;
    if (!songIds.has(s.songId) || !allowed.has(`${s.dimension}:${s.term}`) || seen.has(key)) continue;
    seen.add(key);
    out.push({ songId: s.songId, dimension: s.dimension, term: s.term, note: `AI suggestion: ${s.reason}`.slice(0, 500) });
  }
  return out;
}

export type MessagesClient = Pick<Anthropic, "messages">;

export async function suggestTags(
  client: MessagesClient,
  model: string,
  songs: TagSong[],
  vocabulary: Vocabulary,
): Promise<{ suggestions: AiSuggestion[]; refused: boolean }> {
  if (songs.length === 0) return { suggestions: [], refused: false };
  const response = await client.messages.parse({
    model,
    max_tokens: 8000,
    output_config: { effort: "low", format: zodOutputFormat(outputSchema) },
    messages: [{ role: "user", content: buildTagPrompt(songs, vocabulary) }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) return { suggestions: [], refused: response.stop_reason === "refusal" };
  return { suggestions: filterSuggestions(response.parsed_output.suggestions, songs, vocabulary), refused: false };
}

export function createAiClient(apiKey: string) {
  return new Anthropic({ apiKey });
}
