"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/modules/operations/auth";
import { carryOut, type Proposal } from "@/modules/artist-review/apply-proposal";
import { generateArtistProposals } from "@/modules/artist-review/generate-proposals";

const decisionSchema = z.object({ id: z.uuid(), decision: z.enum(["merge", "new_with_channel", "international", "reject"]), channel: z.string().regex(/^UC[A-Za-z0-9_-]{22}$/).optional() });

/** One click: carries out (or rejects) a proposal as the signed-in reviewer. */
export async function decideProposal(formData: FormData) {
  const { db, profile } = await requireStaff();
  const { id, decision, channel } = decisionSchema.parse({ id: formData.get("id"), decision: formData.get("decision"), channel: formData.get("channel") || undefined });
  if (!["administrator", "data_editor"].includes(profile.role)) throw new Error("forbidden");
  // Merging and adding artists change identities: administrators only.
  if ((decision === "merge" || decision === "new_with_channel") && profile.role !== "administrator") throw new Error("forbidden");
  const admin = createAdminClient();
  const { data: p, error } = await admin.from("artist_proposals").select("*").eq("id", id).eq("status", "open").single();
  if (error || !p) throw new Error("proposal is not open");
  if (decision === "reject") {
    const r = await db.rpc("decide_artist_proposal", { p_id: id, p_decision: "reject", p_note: "" });
    if (r.error) throw new Error(r.error.message);
  } else {
    // A reviewer may pick one of the candidate channels the search found.
    const searched = ((p.evidence as { searched?: { id: string }[] }).searched ?? []).map((c) => c.id);
    if (channel && !searched.includes(channel) && channel !== p.channel_id) throw new Error("channel was not among the candidates");
    await carryOut(db, admin, p as Proposal, decision, profile.display_name ?? "an editor", channel);
  }
  revalidatePath("/dashboard/artists/queue");
  revalidatePath("/dashboard/artists");
  revalidatePath("/artists");
}

/** Runs the daily check now (administrators). */
export async function findProposals() {
  const { profile } = await requireStaff();
  if (profile.role !== "administrator") throw new Error("forbidden");
  await generateArtistProposals(createAdminClient(), process.env.YOUTUBE_API_KEY);
  revalidatePath("/dashboard/artists/queue");
}
