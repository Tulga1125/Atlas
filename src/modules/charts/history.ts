import "server-only";
import { z } from "zod";
import { createPublicDataClient } from "@/lib/supabase/public-data";
import { getCurrentChartSnapshot } from "./current";
import { factSchema } from "@/modules/analytics/calculate";

const archiveSchema = z.object({
  id: z.string(),
  snapshot_date: z.iso.date(),
  collected_at: z.string(),
  entry_count: z.number(),
});
export async function getArchive(before?: string) {
  let query = createPublicDataClient()
    .from("chart_snapshots")
    .select("id,snapshot_date,collected_at,entry_count")
    .eq("status", "approved")
    .order("snapshot_date", { ascending: false })
    .limit(51);
  if (before) query = query.lt("snapshot_date", z.iso.date().parse(before));
  const { data, error } = await query;
  if (error) throw new Error("Archive unavailable");
  const rows = z.array(archiveSchema).parse(data);
  return {
    snapshots: rows.slice(0, 50),
    nextCursor: rows.length > 50 ? rows[49].snapshot_date : null,
  };
}
export async function compareCharts(from: string, to: string) {
  z.iso.date().parse(from);
  z.iso.date().parse(to);
  const [left, right] = await Promise.all([
    getCurrentChartSnapshot(from),
    getCurrentChartSnapshot(to),
  ]);
  const sourceMetadata = new Map<
    string,
    { title?: string; artistName?: string }
  >();
    const { data, error } = await createPublicDataClient()
      .from("chart_facts")
      .select("snapshot_id,rank,raw_metadata")
      .in("snapshot_id", [left.id, right.id]);
    if (error) throw new Error("Comparison evidence unavailable");
    for (const row of data ?? [])
      sourceMetadata.set(
        `${row.snapshot_id}:${row.rank}`,
        z
          .object({
            title: z.string().optional(),
            artistName: z.string().optional(),
          })
          .parse(row.raw_metadata),
      );
  const ids = [
    ...new Set([...left.entries, ...right.entries].map((e) => e.songId)),
  ];
  const entries = ids
    .map((id) => {
      const a = left.entries
        .filter((e) => e.songId === id)
        .sort((x, y) => x.rank - y.rank)[0];
      const b = right.entries
        .filter((e) => e.songId === id)
        .sort((x, y) => x.rank - y.rank)[0];
      const sourceA = a ? sourceMetadata.get(`${left.id}:${a.rank}`) : null;
      const sourceB = b ? sourceMetadata.get(`${right.id}:${b.rank}`) : null;
      return {
        songId: id,
        title: (b ?? a).title,
        artist: (b ?? a).artist,
        fromRank: a?.rank ?? null,
        toRank: b?.rank ?? null,
        change: a && b ? a.rank - b.rank : null,
        status: !a
          ? "entry"
          : !b
            ? "exit"
            : a.rank > b.rank
              ? "up"
              : a.rank < b.rank
                ? "down"
                : "unchanged",
        metadataChanged:
          !!a &&
          !!b &&
          (sourceA && sourceB
            ? sourceA.title !== sourceB.title ||
              sourceA.artistName !== sourceB.artistName
            : a.title !== b.title || a.artist !== b.artist),
      };
    })
    .sort((a, b) => (a.toRank ?? 101) - (b.toRank ?? 101));
  return {
    from: left.date,
    to: right.date,
    fromSnapshotId: left.id,
    toSnapshotId: right.id,
    entries,
  };
}
export async function getSongHistory(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const db = createPublicDataClient();
  const { data: song, error } = await db
    .from("songs")
    .select("id,canonical_title,primary_artist_id,verification,redirect_to")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Song unavailable");
  if (!song) return null;
  const facts = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await db
      .from("chart_facts")
      .select("*")
      .eq("song_id", id)
      .order("snapshot_date", { ascending: false })
      .order("entry_id")
      .range(offset, offset + 999);
    if (response.error) throw new Error("History unavailable");
    const batch = z.array(factSchema).parse(response.data);
    facts.push(...batch);
    if (batch.length < 1000) break;
  }
  const [latest, aliases, recordings] = await Promise.all([
    db
      .from("chart_snapshots")
      .select("snapshot_date")
      .eq("status", "approved")
      .order("snapshot_date", { ascending: false })
      .limit(1),
    db.from("song_aliases").select("alias").eq("song_id", id),
    db.from("recordings").select("id").eq("song_id", id),
  ]);
  if (latest.error || aliases.error || recordings.error)
    throw new Error("Catalog unavailable");
  const assets = recordings.data?.length
    ? await db
        .from("platform_assets")
        .select("id,platform_title,platform_url")
        .in(
          "recording_id",
          recordings.data.map((r) => r.id),
        )
    : { data: [], error: null };
  if (assets.error) throw new Error("Source assets unavailable");
  const byDate = new Map<string, number>();
  for (const f of facts)
    byDate.set(
      f.snapshot_date,
      Math.min(byDate.get(f.snapshot_date) ?? 101, f.rank),
    );
  return {
    id,
    title: song.canonical_title,
    artist: facts[0]?.artist ?? "",
    redirectTo: song.redirect_to as string | null,
    currentRank: byDate.get(latest.data?.[0]?.snapshot_date ?? "") ?? null,
    peakRank: facts.length ? Math.min(...facts.map((f) => f.rank)) : null,
    daysOnChart: byDate.size,
    verification: song.verification as string,
    history: [...byDate].map(([date, rank]) => ({ date, rank })),
    assets: assets.data ?? [],
    aliases: aliases.data?.map((a) => a.alias) ?? [],
  };
}
