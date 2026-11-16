// Owner, 2026-11-17: "we need Mongolian artists only". Marks the named
// international acts from the Apple Music Mongolia chart as international,
// through the audited artist review function, as the administrator. Their
// chart entries stay (approved history is immutable); they leave artist lists
// and the review queue. Dry run unless --apply.
import { loadEnvFile } from "node:process";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values } = parseArgs({ options: { env: { type: "string" }, admin: { type: "string" }, apply: { type: "boolean", default: false } } });
loadEnvFile(values.env!);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const INTERNATIONAL = ["ADÉLA", "Ariana Grande", "BIGBANG", "Billie Eilish", "Cigarettes After Sex", "Dave & Tems", "Drake", "Drake & Majid Jordan", "Ella Langley", "Frank Ocean", "Justin Bieber", "KAROL G, Judeline & rusowsky", "Kanye West", "Kendrick Lamar", "Mac Miller", "Olivia Dean", "Tame Impala", "Tate McRae", "The Weeknd", "The Weeknd & Playboi Carti", "The Weeknd, JENNIE & Lily Rose Depp"];
const svc = createClient(url, service, { auth: { persistSession: false } });
const { data: rows, error } = await svc.from("artists").select("id,canonical_name,artist_type").in("canonical_name", INTERNATIONAL).is("redirect_to", null).neq("locality", "international");
if (error) throw error;
console.log(`${rows.length} records: ${[...new Set(rows.map((r) => r.canonical_name))].join(", ")}`);
if (values.apply) {
  const link = await svc.auth.admin.generateLink({ type: "magiclink", email: values.admin! });
  if (link.error) throw link.error;
  const { data: s, error: e } = await createClient(url, service, { auth: { persistSession: false } }).auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
  if (e || !s.session) throw e ?? new Error("no session");
  const admin = createClient(url, service, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } });
  for (const r of rows) {
    const { error: re } = await admin.rpc("review_artist_identity", {
      p_artist_id: r.id, p_canonical_name: r.canonical_name, p_artist_type: r.artist_type, p_country_code: null,
      p_locality: "international", p_verification: "verified", p_evidence_type: "manual",
      p_evidence_notes: "Owner, 2026-11-17: Atlas lists Mongolian artists only. International act on the Apple Music Mongolia chart; chart history kept.",
    });
    if (re) throw new Error(`${r.canonical_name}: ${re.message}`);
  }
  console.log("marked international:", rows.length);
}
