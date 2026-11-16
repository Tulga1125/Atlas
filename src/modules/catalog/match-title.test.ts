import { describe, expect, test } from "vitest";
import {
  compareTitles,
  matchKey,
  stripTitleNoise,
  videoTitleKey,
} from "./match-title";

// The same pairs are asserted against the SQL mirror in
// supabase/tests/database/009_youtube_catalog.test.sql.
const CYRILLIC_LATIN_PAIRS: [string, string][] = [
  ["Хайртай", "Khairtai"],
  ["Хайртай", "Hairtai"],
  ["Хайртай", "Hayrtai"],
  ["Ээж", "Eej"],
  ["Уулын салхи", "Uulyn salkhi"],
  ["Уулын салхи", "Uuliin salhi"],
  ["Цагаан сар", "Tsagaan sar"],
  ["Жаргал", "Zhargal"],
  ["Жаргал", "Jargal"],
  ["Өглөө", "Öglöö"],
  ["Өглөө", "Ogloo"],
  ["Сэтгэл", "Setgel"],
  ["Чи минь", "Chi mini"],
  ["Юүве юүве юү", "Yuve Yuve Yu"],
  ["Ялалт", "Yalalt"],
  ["Хөх тэнгэр", "Khökh tenger"],
];

describe("matchKey", () => {
  test.each(CYRILLIC_LATIN_PAIRS)("%s ≡ %s", (cyrillic, latin) => {
    expect(matchKey(cyrillic)).toBe(matchKey(latin));
  });

  test("ignores case, punctuation and spacing", () => {
    expect(matchKey("  ХАЙРТАЙ!! ")).toBe(matchKey("hair-tai"));
  });

  test("different songs stay different", () => {
    expect(matchKey("Ээж")).not.toBe(matchKey("Аав"));
    expect(matchKey("Хайр")).not.toBe(matchKey("Хайртай"));
    expect(matchKey("Tsagaan sar")).not.toBe(matchKey("Tsagaan suvd"));
  });

  test("an empty or symbol-only title has no key", () => {
    expect(matchKey("")).toBe("");
    expect(matchKey("!!! ???")).toBe("");
  });
});

describe("stripTitleNoise", () => {
  test.each([
    ["Хайртай (Official Music Video)", "Хайртай"],
    ["Хайртай [Official MV] 4K", "Хайртай"],
    ["Хайртай | Official MV 4K", "Хайртай"],
    ["Хайртай клип", "Хайртай"],
    ["Хайртай (Дууны үг)", "Хайртай"],
    ["Хайртай (feat. Someone)", "Хайртай"],
    ["Хайртай ft. Someone", "Хайртай"],
    ["Хайртай - Official Audio", "Хайртай"],
    ["Live in Ulaanbaatar", "Live in Ulaanbaatar"],
  ])("%s → %s", (title, expected) => {
    expect(stripTitleNoise(title)).toBe(expected);
  });
});

describe("videoTitleKey", () => {
  test("drops an 'Artist - Title' credit for a known artist", () => {
    expect(
      videoTitleKey("The HU - Yuve Yuve Yu (Official Music Video)", ["The HU"]),
    ).toBe(matchKey("Yuve Yuve Yu"));
  });

  test("drops a 'Title - Artist' credit, including Cyrillic credits", () => {
    expect(videoTitleKey("Хайртай - Саран", ["Saran"])).toBe(matchKey("Khairtai"));
  });

  test("drops the credit when one of several credited artists matches", () => {
    expect(videoTitleKey("Saran x Bold - Ээж", ["Болд"])).toBe(matchKey("Eej"));
  });

  test("keeps the whole title when the credit is someone else", () => {
    expect(videoTitleKey("Other Artist - Ээж", ["Saran"])).toBe(
      matchKey("Other Artist Ээж"),
    );
  });
});

describe("compareTitles", () => {
  test("exact across scripts", () => {
    expect(
      compareTitles("Saran - Khairtai (Official MV)", ["Хайртай"], ["Саран"]),
    ).toBe("exact");
  });

  test("song aliases count", () => {
    expect(compareTitles("Hairtai", ["Love Song", "Хайртай"], [])).toBe("exact");
  });

  test("partial when one title contains the other", () => {
    expect(compareTitles("Хайртай 2", ["Хайртай"], [])).toBe("partial");
  });

  test("short titles never match partially", () => {
    expect(compareTitles("Ээж минь", ["Ээж"], [])).toBe("none");
  });

  test("unrelated", () => {
    expect(compareTitles("Шөнө", ["Хайртай"], [])).toBe("none");
  });
});
