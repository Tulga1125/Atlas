import { expect, test, vi } from "vitest";
import { buildTagPrompt, filterSuggestions, suggestTags, type MessagesClient, type TagSong, type Vocabulary } from "./ai-suggest";

const vocabulary: Vocabulary = [
  { dimension: "genre", slug: "pop", labelEn: "Pop" },
  { dimension: "theme", slug: "love", labelEn: "Love" },
  { dimension: "mood", slug: "romantic", labelEn: "Romantic" },
];
const songs: TagSong[] = [{ songId: "s1", title: "Хайртай", artists: ["Saran"], sourceGenres: ["Pop"] }];

test("the prompt carries only permitted metadata and the allowed terms", () => {
  const prompt = buildTagPrompt(songs, vocabulary);
  expect(prompt).toContain('"title":"Хайртай"');
  expect(prompt).toContain("theme: love (Love)");
  expect(prompt).toMatch(/Do not use or quote lyrics/);
  expect(prompt).toMatch(/never infer anyone's religion, ethnicity, politics/);
  expect(prompt).not.toMatch(/scene/);
});

test("unknown songs, unknown terms and duplicates are dropped", () => {
  expect(
    filterSuggestions(
      [
        { songId: "s1", dimension: "theme", term: "love", reason: "Title means beloved." },
        { songId: "s1", dimension: "theme", term: "love", reason: "dup" },
        { songId: "s1", dimension: "theme", term: "war", reason: "not in vocabulary" },
        { songId: "s9", dimension: "genre", term: "pop", reason: "not asked about" },
      ],
      songs,
      vocabulary,
    ),
  ).toEqual([{ songId: "s1", dimension: "theme", term: "love", note: "AI suggestion: Title means beloved." }]);
});

function fakeClient(response: object) {
  const parse = vi.fn().mockResolvedValue(response);
  return { client: { messages: { parse } } as unknown as MessagesClient, parse };
}

test("calls the configured model with structured output and low effort", async () => {
  const { client, parse } = fakeClient({
    stop_reason: "end_turn",
    parsed_output: { suggestions: [{ songId: "s1", dimension: "genre", term: "pop", reason: "Apple lists Pop." }] },
  });
  const result = await suggestTags(client, "claude-haiku-5-5", songs, vocabulary);
  expect(result).toEqual({ suggestions: [{ songId: "s1", dimension: "genre", term: "pop", note: "AI suggestion: Apple lists Pop." }], refused: false });
  const request = parse.mock.calls[0][0];
  expect(request.model).toBe("claude-haiku-5-5");
  expect(request.output_config.effort).toBe("low");
  expect(request.output_config.format).toBeDefined();
});

test("a refusal yields no suggestions and is reported", async () => {
  const { client } = fakeClient({ stop_reason: "refusal", parsed_output: null });
  expect(await suggestTags(client, "claude-haiku-5-5", songs, vocabulary)).toEqual({ suggestions: [], refused: true });
});

test("no songs, no API call", async () => {
  const { client, parse } = fakeClient({});
  expect(await suggestTags(client, "claude-haiku-5-5", [], vocabulary)).toEqual({ suggestions: [], refused: false });
  expect(parse).not.toHaveBeenCalled();
});
