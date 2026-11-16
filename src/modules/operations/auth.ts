import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { z } from "zod";
import { staffRoles } from "@/modules/dashboard/types";

export function isCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const expected = Buffer.from(`Bearer ${secret}`),
    received = Buffer.from(request.headers.get("authorization") ?? "");
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
export async function requireStaff() {
  const db = await createServerSupabaseClient();
  const { data, error } = await db.auth.getClaims();
  if (error || !data?.claims?.sub) throw new Error("unauthenticated");
  const profile = await db
    .from("profiles")
    .select("id,display_name,role,active")
    .eq("id", data.claims.sub)
    .single();
  const parsed = z
    .object({
      id: z.string(),
      display_name: z.string().nullable(),
      role: z.enum(staffRoles),
      active: z.literal(true),
    })
    .safeParse(profile.data);
  if (profile.error || !parsed.success) throw new Error("forbidden");
  return { db, profile: parsed.data };
}
