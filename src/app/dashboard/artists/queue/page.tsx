import Link from "next/link";
import { OperationsShell } from "@/components/operations/shell";
import { staffContext } from "@/modules/operations/data";
import { getLocale } from "@/modules/i18n/server";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { decideProposal, findProposals } from "./actions";

export const dynamic = "force-dynamic";

type Evidence = {
  appleName: string;
  chartDate: string;
  chartSongs: { title: string; rank: number }[];
  rule: string;
  unresolved?: string[];
  channel?: { id: string; title: string; handle: string | null; country: string | null; subscribers: number; videos: number };
  matchedSongs?: string[];
  confidence?: "strong" | "name_only";
  searched?: { title: string; subscribers: number; country: string | null }[];
};

export default async function ArtistQueue() {
  const { db, profile } = await staffContext();
  const locale = await getLocale();
  const copy = getDictionary(locale).artistQueue;
  const admin = profile.role === "administrator";
  const editor = admin || profile.role === "data_editor";
  const { data: proposals, error } = await db.from("artist_proposals").select("*").eq("status", "open").order("created_at");
  if (error) throw new Error("Artist queue unavailable");
  const targetIds = [...new Set(proposals.flatMap((p) => [p.target_artist_id, ...p.co_artist_ids]).filter((x): x is string => !!x))];
  const names = targetIds.length ? (await db.from("artists").select("id,canonical_name").in("id", targetIds)).data ?? [] : [];
  const nameOf = new Map(names.map((n) => [n.id, n.canonical_name]));
  const n = new Intl.NumberFormat(locale === "mn" ? "mn-MN" : "en-US");

  return (
    <OperationsShell section="artists" currentPath="/dashboard/artists/queue">
      <h2>{copy.title}</h2>
      <p className="data-notice">{copy.intro}</p>
      {admin && (
        <form action={findProposals}>
          <button className="button button--ink">{copy.findNow}</button>
        </form>
      )}
      {!admin && <p className="youtube-meta">{copy.adminOnly}</p>}
      {proposals.length === 0 ? (
        <p className="workspace-empty">{copy.empty}</p>
      ) : (
        <div className="operations-cards artist-queue">
          {proposals.map((p) => {
            const e = p.evidence as unknown as Evidence;
            const target = p.target_artist_id ? nameOf.get(p.target_artist_id) ?? "" : "";
            const kind = p.proposal as keyof typeof copy.proposals;
            const approveKey = p.proposal as keyof typeof copy.approve;
            const button = (decision: string, label: string, enabled: boolean, primary = false) => (
              <form action={decideProposal}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="decision" value={decision} />
                <button className={primary ? "button button--red" : "button"} disabled={!enabled}>{label}</button>
              </form>
            );
            return (
              <article key={p.id}>
                <h3>{e.appleName}</h3>
                <p><strong>{copy.proposals[kind].replace("{target}", target)}</strong></p>
                <p className="youtube-meta">
                  {copy.chartSongs} {e.chartDate}: {e.chartSongs.map((s) => `№${s.rank} ${s.title}`).join(" · ")}
                </p>
                <details open>
                  <summary>{copy.evidence}</summary>
                  <ul>
                    <li>{e.rule}</li>
                    {p.co_artist_ids.length > 0 && <li>{copy.coArtists}: {p.co_artist_ids.map((c) => nameOf.get(c) ?? c).join(", ")}</li>}
                    {e.unresolved && e.unresolved.length > 0 && <li>{copy.unresolved}: {e.unresolved.join(", ")}</li>}
                    {e.channel && (
                      <li>
                        <a href={`https://www.youtube.com/channel/${e.channel.id}`} target="_blank" rel="noreferrer">{e.channel.title} {e.channel.handle ?? ""}</a>
                        {" "}· {n.format(e.channel.subscribers)} {copy.subscribers} · {e.channel.country ?? "—"}
                      </li>
                    )}
                    {e.confidence && <li>{e.confidence === "strong" ? copy.strong : copy.nameOnly}</li>}
                    {e.matchedSongs && e.matchedSongs.length > 0 && <li>{copy.matchedSongs}: {e.matchedSongs.join(", ")}</li>}
                    {e.searched && e.searched.map((c) => <li key={c.title}>{c.title} · {n.format(c.subscribers)} · {c.country ?? "—"}</li>)}
                  </ul>
                </details>
                <div className="artist-queue__actions">
                  {p.proposal in copy.approve && button(p.proposal, copy.approve[approveKey].replace("{target}", target), p.proposal === "international" ? editor : admin, true)}
                  {p.proposal !== "international" && button("international", copy.markInternational, editor)}
                  {button("reject", copy.reject, editor)}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p><Link href="/dashboard/artists">← {getDictionary(locale).artistReview.queueTitle}</Link></p>
    </OperationsShell>
  );
}
