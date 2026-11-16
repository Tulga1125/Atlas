import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
// A separate database in the isolated local container; never points at a cloud project.
const container = "supabase_db_atlas-charts-test";
const name = `atlas_restore_drill_${Date.now()}`;
const docker = (args, input) =>
  execFileSync(
    "docker",
    ["exec", ...(input ? ["-i"] : []), container, ...args],
    { input, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 128 * 1024 * 1024 },
  );
const tables = [
  "chart_snapshots",
  "chart_entries",
  "raw_payloads",
  "collection_attempts",
  "analysis_runs",
  "chart_metrics",
  "editorial_drafts",
  "publications",
  "catalog_operations",
  "audit_logs",
];
const fingerprint = (database) => {
  const sql = tables
    .map(
      (t) =>
        `select '${t}',count(*),md5(coalesce(string_agg(to_jsonb(r)::text,'' order by to_jsonb(r)::text),'')) from public.${t} r;`,
    )
    .join("\n");
  return docker([
    "psql",
    "-U",
    "postgres",
    "-d",
    database,
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    sql,
  ]).toString();
};
const started = Date.now();
let created = false;
try {
  const before = fingerprint("postgres");
  const dump = docker(["pg_dump", "-U", "postgres", "-d", "postgres", "-Fc"]);
  docker(["createdb", "-U", "postgres", name]);
  created = true;
  docker(
    ["pg_restore", "-U", "supabase_admin", "-d", name, "--exit-on-error"],
    dump,
  );
  const after = fingerprint(name);
  if (before !== after)
    throw new Error(
      "Restored source, calculation, publication, or audit evidence differs",
    );
  console.log(
    JSON.stringify(
      {
        result: "passed",
        database: name,
        tables: tables.length,
        backupSha256: createHash("sha256").update(dump).digest("hex"),
        elapsedSeconds: Math.round((Date.now() - started) / 1000),
      },
      null,
      2,
    ),
  );
} finally {
  if (created) docker(["dropdb", "-U", "postgres", name]);
}
