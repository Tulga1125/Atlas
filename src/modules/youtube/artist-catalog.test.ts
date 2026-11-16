import { describe, expect, test } from "vitest";
import { classifyUploads, songTitle, ulaanbaatarDate, type ImportArtist } from "./artist-catalog";
import type { CandidateVideo } from "./discovery";

const CH = "UCSYAYTS8OwlknJMOmKXSB9g";
const artist: ImportArtist = { name: "ThunderZ", channelId: CH, aliases: ["THUNDERZ"], isLabel: false };

let n = 0;
function video(title: string, over: Partial<CandidateVideo> = {}): CandidateVideo {
  n += 1;
  return {
    videoId: `vid${String(n).padStart(8, "0")}`,
    channelId: CH,
    channelTitle: "THUNDERZ",
    title,
    publishedAt: `2025-01-${String(n).padStart(2, "0")}T20:00:00Z`,
    durationSeconds: 210,
    isShort: false,
    suggestedKind: /lyric/i.test(title) ? "lyric_video" : /official music video/i.test(title) ? "official_music_video" : /live/i.test(title) ? "live" : "other",
    thumbnailUrl: null,
    ...over,
  };
}

describe("songTitle", () => {
  test.each([
    ["ThunderZ ft. Ninjin - Kiss Me (Official Music Video)", "Kiss Me"],
    ["ThunderZ - Tengri: GEGEEN (ft. Ninjin & Monjigo)", "Tengri: GEGEEN"],
    ['GANGBAY - "HARANGA" (OFFICIAL MUSIC VIDEO)', "HARANGA"],
    ["Хайртай - ThunderZ", "Хайртай"],
    ["Niseerei", "Niseerei"],
    ["ThunderZ - Flu Game (prod. by b1shrel)", "Flu Game"],
    ["ThunderZ - Bolno Butne (No Promo)", "Bolno Butne"],
    ["ThunderZ - Tsetseg (Official Video) Prod by Aylagch", "Tsetseg"],
  ])("%s → %s", (title, expected) => {
    expect(songTitle(title, artist)).toBe(expected);
  });
});

describe("classifyUploads", () => {
  test("one song per title; the official video is the source, others are versions", () => {
    const mv = video("ThunderZ - Kiss Me (Official Music Video)");
    const lyric = video("ThunderZ - Kiss Me (Lyric Video)", { publishedAt: "2024-12-01T00:00:00Z" });
    const { songs } = classifyUploads(artist, [lyric, mv]);
    expect(songs).toHaveLength(1);
    expect(songs[0].title).toBe("Kiss Me");
    expect(songs[0].releaseDate).toBe("2024-12-01");
    expect(songs[0].videos.find((v) => v.role === "source")?.videoId).toBe(mv.videoId);
  });

  test("skips shorts, teasers, long streams and other channels, with reasons", () => {
    const { songs, skipped } = classifyUploads(artist, [
      video("Kiss Me #shorts", { isShort: true, durationSeconds: 30 }),
      video("ThunderZ - Kiss Me (Teaser)"),
      video("Tour livestream", { durationSeconds: 7200 }),
      video("ThunderZ - Song", { channelId: "UCaaaaaaaaaaaaaaaaaaaaaa" }),
      video("Upcoming premiere", { durationSeconds: null }),
    ]);
    expect(songs).toHaveLength(0);
    expect(skipped.map((s) => s.reason)).toEqual(["short", "not_a_song", "too_long_for_a_song", "other_channel", "too_short_or_unknown_length"]);
  });

  test("a live video joins a studio song but never creates one", () => {
    const studio = video("ThunderZ - Niseerei (Official Music Video)");
    const live = video("ThunderZ - Niseerei (Live)");
    const lonely = video("ThunderZ - Other Song (Live)");
    const { songs, skipped } = classifyUploads(artist, [studio, live, lonely]);
    expect(songs.map((s) => [s.title, s.videos.length])).toEqual([["Niseerei", 2]]);
    expect(skipped.find((s) => s.videoId === lonely.videoId)?.reason).toBe("live_without_studio_version");
  });

  test("credits: named in the credit is primary; only in ft. is featured", () => {
    const own = video("ThunderZ - Own Song (Official Music Video)");
    const guest = video("Ulaanbaatariin Nulims - Tatar ft ThunderZ");
    const { songs } = classifyUploads(artist, [own, guest]);
    expect(Object.fromEntries(songs.map((s) => [s.title, s.credit]))).toEqual({ "Own Song": "primary", Tatar: "featured" });
  });

  test("another artist's song on the channel is not credited to the channel owner", () => {
    const { songs, skipped } = classifyUploads(artist, [video("OG BRO - KAHT ft 1A"), video("Own Upload (Official Music Video)")]);
    expect(songs.map((s) => s.title)).toEqual(["Own Upload"]);
    expect(skipped[0].reason).toBe("credited_to_another_artist");
  });

  test("short names match as whole credits only", () => {
    const crew: ImportArtist = { name: "113", channelId: CH, aliases: [], isLabel: false };
    const { songs, skipped } = classifyUploads(crew, [video("113 X GINJIN - ZUUNII ZUGAA"), video("1A x 113 - 2020 (Official Music Video)"), video("Gurvel - Oimsoo tat")]);
    expect(songs.map((s) => s.title).sort()).toEqual(["2020", "ZUUNII ZUGAA"]);
    expect(skipped.map((s) => s.reason)).toEqual(["credited_to_another_artist"]);
  });

  test("a member's solo upload on the group's channel is credited to the member", () => {
    const band: ImportArtist = { name: "Gangbay", channelId: CH, aliases: [], isLabel: false, members: [{ name: "Baynaa", aliases: ["BAY"], artistId: "m-baynaa" }] };
    const { songs, skipped } = classifyUploads(band, [
      video("Baynaa ft Ebo - Not Today ( Official Music Video )"),
      video("Gangbay - Sedev (Official Music Video)"),
      video("Stranger - Song (Official Music Video)"),
    ]);
    expect(songs.map((s) => [s.title, s.artistId ?? null, s.credit])).toEqual([["Not Today", "m-baynaa", "primary"], ["Sedev", null, "primary"]]);
    expect(skipped.map((s) => s.reason)).toEqual(["credited_to_another_artist"]);
  });

  test("a label channel keeps only uploads that name the artist", () => {
    const label: ImportArtist = { name: "B Tamir", channelId: CH, aliases: [], isLabel: true };
    const { songs, skipped } = classifyUploads(label, [video("B Tamir - 3030 (Official Music Video)"), video("Someone Else - Song (Official Music Video)")]);
    expect(songs.map((s) => s.title)).toEqual(["3030"]);
    expect(skipped[0].reason).toBe("label_upload_by_another_artist");
  });

  test("is deterministic regardless of input order", () => {
    const vids = [video("ThunderZ - A (Official Music Video)"), video("ThunderZ - B"), video("ThunderZ - A (Lyric Video)")];
    expect(classifyUploads(artist, [...vids].reverse())).toEqual(classifyUploads(artist, vids));
  });
});

test("ulaanbaatarDate uses UTC+8", () => {
  expect(ulaanbaatarDate("2025-01-01T20:00:00Z")).toBe("2025-01-02");
  expect(ulaanbaatarDate(null)).toBeNull();
});
