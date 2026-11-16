import { createAdminClient } from "@/lib/supabase/admin";
import { getAtlasBusinessDate } from "./business-date";

export async function collectAppleMusicMongolia(now = new Date()) {
  const db = createAdminClient();
  const { data, error } = await db.rpc("enqueue_collection", {
    p_date: getAtlasBusinessDate(now),
  });
  if (error) throw new Error(error.message);
  return { jobId: data as string, snapshotDate: getAtlasBusinessDate(now) };
}
