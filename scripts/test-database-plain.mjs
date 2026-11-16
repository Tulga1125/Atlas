// Runs every migration and pgTAP test against a throwaway local PostgreSQL
// cluster, for environments without Docker. Supabase-specific pieces are
// stood in by scripts/lib/supabase-shim.sql. The real gate remains
// `pnpm test:setup && pnpm test:db` (Supabase CLI), which CI runs.
//
// Usage: ATLAS_PG_BIN=/usr/lib/postgresql/16/bin node scripts/test-database-plain.mjs
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const bin = process.env.ATLAS_PG_BIN ?? "/usr/lib/postgresql/16/bin";
const port = "55399";
const dir = mkdtempSync(join(tmpdir(), "atlas-pg-plain-"));
const asPostgres = process.getuid?.() === 0 ? ["-u", "postgres"] : null;
const run = (cmd, args, opts = {}) =>
  asPostgres
    ? execFileSync("sudo", [...asPostgres, cmd, ...args], opts)
    : execFileSync(cmd, args, opts);
if (asPostgres) execFileSync("chown", ["postgres", dir]);
run(join(bin, "initdb"), ["-D", join(dir, "data"), "-U", "postgres", "-A", "trust"], { stdio: "ignore" });
run(join(bin, "pg_ctl"), ["-D", join(dir, "data"), "-o", `-p ${port} -k ${dir} -c listen_addresses=''`, "-l", join(dir, "log"), "-w", "start"], { stdio: "ignore" });
const psql = (args, input) =>
  spawnSync("psql", ["-h", dir, "-p", port, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-X", "-q", ...args], { encoding: "utf8", input });
let failed = 0;
try {
  const step = (label, args) => {
    const r = psql(args);
    if (r.status !== 0) throw new Error(`${label} failed:\n${r.stderr}`);
    return r.stdout;
  };
  step("shim", ["-f", "scripts/lib/supabase-shim.sql"]);
  for (const f of readdirSync("supabase/migrations").sort())
    step(f, ["-f", join("supabase/migrations", f)]);
  const only = process.argv.slice(2);
  for (const f of readdirSync("supabase/tests/database").sort()) {
    if (only.length && !only.some((o) => f.includes(o))) continue;
    const r = psql(["-t", "-A", "-f", join("supabase/tests/database", f)]);
    const out = `${r.stdout}${r.stderr}`;
    const notOk = out.split("\n").filter((l) => l.startsWith("not ok") || l.startsWith("#") || l.includes("ERROR"));
    const ok = out.split("\n").filter((l) => l.startsWith("ok")).length;
    const bad = r.status !== 0 || notOk.some((l) => l.startsWith("not ok") || l.includes("ERROR") || /Looks like/.test(l));
    console.log(`${bad ? "FAIL" : "ok  "} ${f} (${ok} passed)`);
    if (bad) { failed++; console.log(notOk.slice(0, 20).join("\n")); }
  }
} finally {
  run(join(bin, "pg_ctl"), ["-D", join(dir, "data"), "-m", "immediate", "stop"], { stdio: "ignore" });
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
