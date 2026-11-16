import "server-only";
import { z } from "zod";
import { createPublicDataClient } from "@/lib/supabase/public-data";
export const publicationSchema = z.object({
  id: z.string(),
  headline_mn: z.string(),
  body_mn: z.string(),
  headline_en: z.string().nullable(),
  body_en: z.string().nullable(),
  published_at: z.string(),
  source_facts: z.unknown(),
  external_url: z.string().nullable(),
  channel: z.string(),
});
export async function getPublications(before?: string) {
  let query = createPublicDataClient()
    .from("publications")
    .select(
      "id,headline_mn,body_mn,headline_en,body_en,published_at,source_facts,external_url,channel",
    )
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(21);
  if (before) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(
        Buffer.from(z.string().max(512).parse(before), "base64url").toString(),
      );
    } catch {
      decoded = null;
    }
    const cursor = z
      .object({ date: z.iso.datetime({ offset: true }), id: z.uuid() })
      .parse(decoded);
    query = query.or(
      `published_at.lt.${cursor.date},and(published_at.eq.${cursor.date},id.lt.${cursor.id})`,
    );
  }
  const { data, error } = await query;
  if (error) throw new Error("Publications unavailable");
  const rows = z.array(publicationSchema).parse(data);
  return {
    articles: rows.slice(0, 20),
    nextCursor:
      rows.length > 20
        ? Buffer.from(
            JSON.stringify({ date: rows[19].published_at, id: rows[19].id }),
          ).toString("base64url")
        : null,
  };
}
export async function getPublication(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await createPublicDataClient()
    .from("publications")
    .select(
      "id,headline_mn,body_mn,headline_en,body_en,published_at,source_facts,external_url,channel",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Publication unavailable");
  return data ? publicationSchema.parse(data) : null;
}
