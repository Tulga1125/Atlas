import { describe, expect, test } from "vitest";
import { cleanSongTitle, looksLikeNotASong } from "./clean-title";

describe("cleanSongTitle (real titles from the catalogue)", () => {
  test.each([
    ["113 AIDAS // PROD BY COZYSLASHCLOT", ["113"], "AIDAS"],
    ["113 NICITON // ЗАВААН АВГА АХ OST", ["113"], "NICITON"],
    ["113 BULSARA", ["113"], "BULSARA"],
    ["B Tamir -MC Killa(Smoke Tatah Durtai)", ["B Tamir"], "MC Killa(Smoke Tatah Durtai)"],
    ["Everything |Offical Music Video|", ["Tatar"], "Everything"],
    ["Hair Haaya /Official Music Video/", [], "Hair Haaya"],
    ["Асууя /MV/", [], "Асууя"],
    ["Аялгуу /MV 2024/", [], "Аялгуу"],
    ["Tsasan hayalga /lyrics video/", [], "Tsasan hayalga"],
    ["GIFT /prod.by baatarfly/", [], "GIFT"],
    ["Showdsha prod.by Cozyslashclot", [], "Showdsha"],
    ["G-Loc \"Coole Loce Boy", [], "G-Loc Coole Loce Boy"],
    ["Bid \"NAR", [], "Bid NAR"],
    ["Kiss Me @146byThunderZ", [], "Kiss Me"],
    ["Imagine (@fruitybaachka)", [], "Imagine"],
    ["Chinii Tuluu - Avdriin Yorool (S2:E3)", [], "Chinii Tuluu"],
    ["Bid bugdeeree huuhduud (Anagaahiin aldartnuud OST)", [], "Bid bugdeeree huuhduud"],
    ["Hanahgui - Love and Sex OST", [], "Hanahgui"],
    ["2 Guurnii Tsaana ( EL YAMA ALBUM )", [], "2 Guurnii Tsaana"],
    ["ULAANBAATAR GUNIGTAI 🎬📽🎞🎥BLOND.//YASHA", [], "ULAANBAATAR GUNIGTAI"],
    ["The Royal Heartaches • Enelel", ["The Royal Heartaches"], "Enelel"],
    ["290 ~ BEMR", ["290"], "BEMR"],
    ["SPEED 2️⃣9️⃣0️⃣", ["290"], "SPEED"],
    ["Noyon Emegtei OST", [], "Noyon Emegtei"],
    ["THE TRAUMA OST", [], "THE TRAUMA"],
    ["AMIDRAL // ICEMAN REMIX", ["113"], "AMIDRAL (ICEMAN REMIX)"],
    ["ТАТАР- Хамтдаа /REMIX/", ["Tatar", "ТАТАР"], "Хамтдаа (REMIX)"],
    ["UDUR BUR /MOLOTOV ALBUM/", [], "UDUR BUR"],
    ["Ardiin bagsh /Х.Сумъяадорж, Н.Түвшин, Б.Тэмүүжин,/", [], "Ardiin bagsh"],
    ["Gerelt Hot /LITE CITY/", [], "Gerelt Hot"],
    ["113 ''G SHAQ U", ["113"], "G SHAQ U"],
    ["Click Click Boom -Good Times", ["Click Click Boom"], "Good Times"],
    ["111221 -ARMAN BAKHYTBYEK, SEKSTSAGAANBOGD @baatarfly", ["Sekstsagaanbogd"], "111221"],
    ["C/S 21BULLET ALBUM", ["Limit King"], "C/S"],
    ["ChiniiHeer by", ["Enerel"], "ChiniiHeer"],
    ["Maria, Maria by Enerel & Kanzas", ["Enerel"], "Maria, Maria"],
    ["Used Guy MV Directed by BLCKHAND Films", ["Enerel"], "Used Guy"],
    ["00:01 {MUSiC ViDEO}", ["Enerel"], "00:01"],
    ["Zoriulagdsan MV", ["Enerel"], "Zoriulagdsan"],
    ["Uyahan Horvoon Hani [COVER SONG]", ["Enerel"], "Uyahan Horvoon Hani"],
    ["SHULEG (GOO BRAND)", ["Enerel"], "SHULEG"],
    ["UULEN DEEGUUR (VISUAL)", ["Opozit"], "UULEN DEEGUUR"],
    ["Love Birds GOO BRAND", ["Enerel"], "Love Birds"],
    ["Bohiin Magtaal Энэрэл - Бөхийн Магтаал", ["Enerel", "Энэрэл"], "Bohiin Magtaal"],
    ["15nii Saran Болдбаатар, Хуурч Жигжиддорж, Энэрэл - 15ны Саран", ["Enerel", "Энэрэл"], "15nii Saran"],
  ])("%s → %s", (raw, artists, expected) => {
    expect(cleanSongTitle(raw, artists as string[])).toBe(expected);
  });

  test("keeps real version words and stylised names", () => {
    expect(cleanSongTitle("Chi Haana Baina (Chill Remix)")).toBe("Chi Haana Baina (Chill Remix)");
    expect(cleanSongTitle("Hairiin Huch - Club Mix")).toBe("Hairiin Huch - Club Mix");
    expect(cleanSongTitle("#MEAN")).toBe("#MEAN");
    expect(cleanSongTitle("Minii ter...")).toBe("Minii ter...");
    expect(cleanSongTitle("2020", ["113"])).toBe("2020");
    expect(cleanSongTitle("Bold & Uka Chamdaa Heley Remix", ["Bold"])).toBe("Bold & Uka Chamdaa Heley Remix");
    expect(cleanSongTitle("Ginjin x Tiger Brand", ["Ginjin"])).toBe("Ginjin x Tiger Brand");
    expect(cleanSongTitle("Aaviin Zahia (Original Score)")).toBe("Aaviin Zahia (Original Score)");
    expect(cleanSongTitle("Madb1shrel & B Tamir", ["B Tamir"])).toBe("Madb1shrel & B Tamir");
    expect(cleanSongTitle("road w/o u")).toBe("road w/o u");
    expect(cleanSongTitle("Stand by Me", ["Enerel"])).toBe("Stand by Me");
    expect(cleanSongTitle("O.G MOB x 113", ["O.G MOB", "O.G"])).toBe("O.G MOB x 113");
    expect(cleanSongTitle("Love track #004 (Demo / Unmastered)")).toBe("Love track #004 (Demo / Unmastered)");
    expect(cleanSongTitle("290 ~ THOUGHTS/TSETSEG", ["290"])).toBe("THOUGHTS/TSETSEG");
  });

  test("never returns an empty title", () => {
    expect(cleanSongTitle("/Official Music Video/")).toBe("/Official Music Video/");
  });
});

test("flags uploads that are not songs", () => {
  expect(looksLikeNotASong("Episode 1")).toBe(true);
  expect(looksLikeNotASong("10th year anniversary 2026.10.17 @UG Palace")).toBe(true);
  expect(looksLikeNotASong("NINJA BOIS\" PROMOTION VIDEO prod by 976BeatZ")).toBe(true);
  expect(looksLikeNotASong("GEEOMETRY\" Album REVIEW")).toBe(true);
  expect(looksLikeNotASong("The Lemons XXII Documentary")).toBe(true);
  expect(looksLikeNotASong("HARANGA 30 баримтат кино /1-р хэсэг/")).toBe(true);
  expect(looksLikeNotASong("mxrningstar invites a fan to play with the band.")).toBe(true);
  expect(looksLikeNotASong("Prematch Press Conference")).toBe(true);
  expect(looksLikeNotASong("Kiss Me")).toBe(false);
});
