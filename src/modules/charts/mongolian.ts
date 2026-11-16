import type { ChartEntry } from "./types";

// Owner, 2026-11-17: Atlas shows Mongolian artists only. The approved Apple
// Music Top 100 is stored unchanged (evidence); visitors see the Mongolian
// songs in it, numbered among themselves, with their Top 100 rank alongside.

export type MongolianEntry = ChartEntry & { mongolianRank: number };

export function mongolianView(entries: ChartEntry[]): MongolianEntry[] {
  return [...entries]
    .filter((e) => e.isLocal)
    .sort((a, b) => a.rank - b.rank)
    .map((e, i) => ({ ...e, mongolianRank: i + 1 }));
}
