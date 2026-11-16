import { describe, expect, test } from "vitest";
import {
  countingKinds,
  isLikelyShort,
  parseDuration,
  parseVideoId,
  publicSourceUrl,
  suggestKind,
} from "./video";

describe("parseVideoId", () => {
  test.each([
    ["dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://music.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("%s", (input, id) => expect(parseVideoId(input)).toBe(id));

  test.each([
    "",
    "not a url",
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/channel/UC1234567890123456789012",
    "javascript:alert(1)",
  ])("rejects %s", (input) => expect(parseVideoId(input)).toBeNull());
});

test("parseDuration", () => {
  expect(parseDuration("PT3M21S")).toBe(201);
  expect(parseDuration("PT1H2M3S")).toBe(3723);
  expect(parseDuration("PT45S")).toBe(45);
  expect(parseDuration("P1DT1S")).toBe(86_401);
  expect(parseDuration("P0D")).toBe(0);
  expect(parseDuration("PT")).toBeNull();
  expect(parseDuration("3:21")).toBeNull();
  expect(parseDuration(undefined)).toBeNull();
});

test("isLikelyShort", () => {
  expect(isLikelyShort("Хайртай #shorts", null, 170)).toBe(true);
  expect(isLikelyShort("Хайртай", null, 58)).toBe(true);
  expect(isLikelyShort("Хайртай", null, 201)).toBe(false);
  expect(isLikelyShort("Хайртай", null, null)).toBe(false);
  expect(isLikelyShort("Live stream", null, 0)).toBe(false);
});

describe("suggestKind", () => {
  const verified = { channelTitle: "Saran", fromVerifiedChannel: true };
  test.each([
    ["Хайртай (Official Music Video)", "official_music_video"],
    ["Хайртай клип", "official_music_video"],
    ["Хайртай (Lyric Video)", "lyric_video"],
    ["Хайртай (Дууны үг)", "lyric_video"],
    ["Хайртай (Official Audio)", "official_audio"],
    ["Хайртай (Live at UB Palace)", "live"],
    ["Хайртай - тоглолт", "live"],
    ["Behind the scenes", "other"],
  ])("%s → %s", (title, kind) =>
    expect(suggestKind({ title, ...verified })).toBe(kind),
  );

  test("auto-generated Topic channels are official audio", () => {
    expect(
      suggestKind({ title: "Хайртай", channelTitle: "Saran - Topic", fromVerifiedChannel: true }),
    ).toBe("official_audio");
  });

  test("an unverified channel cannot be suggested as official", () => {
    expect(
      suggestKind({ title: "Хайртай (Official MV)", channelTitle: "Fan", fromVerifiedChannel: false }),
    ).toBe("other");
  });

  test("live and fan uploads do not count towards a song (D4)", () => {
    expect(countingKinds).not.toContain("live");
    expect(countingKinds).not.toContain("other");
  });
});

test("publicSourceUrl strips the API key", () => {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos?id=a&key=SECRET");
  expect(publicSourceUrl(url)).not.toContain("SECRET");
  expect(publicSourceUrl(url)).toContain("id=a");
});
