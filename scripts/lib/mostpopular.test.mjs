import { expect, test } from "vitest";
import { looksMongolian, summarise } from "./mostpopular.mjs";

const item = (id, title, channelTitle, extra = {}) => ({ id, snippet: { title, channelTitle, ...extra } });

test("Mongolian-only letters or a Mongolian language tag", () => {
  expect(looksMongolian(item("a", "Хөх тэнгэр", "Saran"))).toBe(true);
  expect(looksMongolian(item("b", "Song", "Чингис", { defaultAudioLanguage: "mn" }))).toBe(true);
  expect(looksMongolian(item("c", "Песня", "Russian channel"))).toBe(false); // Cyrillic is not enough
  expect(looksMongolian(item("d", "K-pop hit", "Label"))).toBe(false);
});

test("summary says whether a feed would be meaningful", () => {
  const mostlyMongolian = Array.from({ length: 20 }, (_, i) => item(`m${i}`, i < 10 ? "Үүрийн гэгээ" : "Global hit", `Channel ${i % 4}`));
  expect(summarise("music", { items: mostlyMongolian })).toMatchObject({ count: 20, channels: 4, looksMongolian: 10, share: 0.5, meaningful: true });
  expect(summarise("all", { items: [item("x", "Global hit", "Label")] })).toMatchObject({ count: 1, meaningful: false });
  expect(summarise("empty", {})).toMatchObject({ count: 0, meaningful: false });
});
