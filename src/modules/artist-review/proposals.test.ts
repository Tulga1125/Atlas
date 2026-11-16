import { describe, expect, test } from "vitest";
import { channelEvidence, indexArtists, looseKey, matchCredit, pickChannel, splitCredit, type ChannelCandidate } from "./proposals";

const index = indexArtists([
  { id: "ginjin", names: ["Ginjin"] },
  { id: "btamir", names: ["B Tamir", "B.Tamir"] },
  { id: "fruity", names: ["Fruitybaachka"] },
]);

describe("credits", () => {
  test("splits joint credits", () => {
    expect(splitCredit("Fruitybaachka & Bektor Petrovic")).toEqual(["Fruitybaachka", "Bektor Petrovic"]);
    expect(splitCredit("KAROL G, Judeline & rusowsky")).toEqual(["KAROL G", "Judeline", "rusowsky"]);
    expect(splitCredit("Ginjin x B Tamir")).toEqual(["Ginjin", "B Tamir"]);
  });
  test("a known name proposes a merge, with co-artists and unresolved names", () => {
    expect(matchCredit("Ginjin & B Tamir", index)).toEqual({ kind: "merge", target: "ginjin", coArtists: ["btamir"], unresolved: [] });
    expect(matchCredit("Fruitybaachka & Bektor Petrovic", index)).toEqual({ kind: "merge", target: "fruity", coArtists: [], unresolved: ["Bektor Petrovic"] });
  });
  test("an unknown first name needs a channel search", () => {
    expect(matchCredit("Opozit", index)).toEqual({ kind: "unknown", parts: ["Opozit"] });
  });
});

test("looseKey ignores featured credits, live-session notes and soft signs", () => {
  expect(looseKey("Hair (feat. Opozit)")).toBe(looseKey("Hair"));
  expect(looseKey("Bam bam /Bid NAR Live Session/")).toBe(looseKey("Bam Bam"));
  expect(looseKey("Хайр нь арыг нь даана")).toBe(looseKey("Hair n Ariig n Daana"));
});

const channel = (over: Partial<ChannelCandidate>): ChannelCandidate => ({
  channelId: "UCaaaaaaaaaaaaaaaaaaaaaa", title: "Opozit", handle: "@opozit", country: "MN", subscribers: 5000, videos: 20, uploadTitles: [], ...over,
});

describe("channels", () => {
  test("a chart song in the uploads is strong evidence", () => {
    const e = channelEvidence("Opozit", ["Hair (feat. Tsetse)"], channel({ uploadTitles: ["Opozit - Hair (Official Video)"] }));
    expect(e).toEqual({ nameMatches: true, exactName: true, matchedSongs: ["Hair (feat. Tsetse)"], topic: false });
  });
  test("picks the channel with matched songs over a bigger one with none", () => {
    const pick = pickChannel("Opozit", ["Hair"], [
      channel({ channelId: "UCbig00000000000000000000".slice(0, 24), subscribers: 900000, uploadTitles: ["Vlog"] }),
      channel({ channelId: "UCsmall000000000000000000".slice(0, 24), subscribers: 2000, uploadTitles: ["Opozit - Hair"] }),
    ], 1000);
    expect(pick?.channel.subscribers).toBe(2000);
    expect(pick?.confidence).toBe("strong");
  });
  test("a different name, a Topic channel or a tiny channel is not proposed", () => {
    expect(pickChannel("Opozit", ["Hair"], [channel({ title: "Someone Else" })], 1000)).toBeNull();
    expect(pickChannel("Opozit", ["Hair"], [channel({ title: "Opozit - Topic", uploadTitles: ["Hair"] })], 1000)).toBeNull();
    expect(pickChannel("Opozit", ["Hair"], [channel({ subscribers: 10 })], 1000)).toBeNull();
  });
  test("a similar name in another country is not proposed without a chart song", () => {
    expect(pickChannel("Opozit", ["Hair"], [channel({ title: "Oppozit moto Belarus", country: "BY", subscribers: 50000 })], 1000)).toBeNull();
    expect(pickChannel("The Compass", ["Song"], [channel({ title: "The Compass Church", country: "US", subscribers: 50000 })], 1000)).toBeNull();
    expect(pickChannel("BECCA", ["Song"], [channel({ title: "Becca Watson", country: null, subscribers: 50000 })], 1000)).toBeNull();
  });
  test("a matching name with enough subscribers is a name-only proposal", () => {
    expect(pickChannel("Opozit", ["Hair"], [channel({})], 1000)?.confidence).toBe("name_only");
  });
});
