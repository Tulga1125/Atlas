import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";
import { discoverArtists, validateImport } from "./lib/musicbrainz.mjs";

const { values } = parseArgs({ options: {
  input: { type: "string" }, output: { type: "string", default: ".local/artist-imports/musicbrainz-mn.json" },
  curated: { type: "string" }, apply: { type: "boolean", default: false },
  env: { type: "string", default: ".env.local" },
} });
const curated = values.curated ? JSON.parse(await readFile(values.curated, "utf8")) : [];
const discovery = values.input ? JSON.parse(await readFile(values.input, "utf8")) : await discoverArtists({ curated });
const batch = validateImport(discovery, curated);
await mkdir(dirname(values.output), { recursive: true });
await writeFile(values.output, JSON.stringify(batch.payload, null, 2) + "\n");
console.log(`${batch.payload.count} source-listed candidates; ${batch.curated.length} curated identities. Snapshot: ${values.output}`);
if (values.apply) {
  loadEnvFile(values.env);
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Artist imports require NEXT_PUBLIC_SUPABASE_URL and a server-only SUPABASE_SERVICE_ROLE_KEY.");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  console.log(`Import target: ${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host}`);
  const { data, error } = await db.rpc("import_musicbrainz_artists", { p_payload: batch.payload, p_curated: batch.curated });
  if (error) throw new Error(`Artist import failed: ${error.message}`);
  await writeFile(`${values.output}.report.json`, JSON.stringify(data, null, 2) + "\n");
  console.log(JSON.stringify(data));
} else {
  console.log("Discovery only. Use --input with this snapshot and --apply to write to the configured database. --curated explicitly publishes the supplied source-reviewed starter identities.");
}
