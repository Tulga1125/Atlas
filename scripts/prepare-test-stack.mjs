import { mkdtemp, cp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { parseEnv } from "node:util";
let previous = {};
try {
  previous = parseEnv(await readFile(".env.test.local", "utf8"));
} catch {}
const directory =
  previous.ATLAS_TEST_WORKDIR ??
  (await mkdtemp(join(tmpdir(), "atlas-charts-test-")));
await cp("supabase", join(directory, "supabase"), {
  recursive: true,
  filter: (source) =>
    !source.includes("/.temp") && !source.includes("/.branches"),
});
const path = join(directory, "supabase/config.toml");
const config = (await readFile(path, "utf8"))
  .replace('project_id = "atlas-charts"', 'project_id = "atlas-charts-test"')
  .replaceAll("5432", "5532")
  .replaceAll("http://localhost:3000", "http://127.0.0.1:3101")
  .replaceAll("http://127.0.0.1:3000", "http://127.0.0.1:3101");
await writeFile(path, config);
console.log("Starting isolated Atlas test services on ports 55321–55323.");
execFileSync(
  "pnpm",
  [
    "exec",
    "supabase",
    "start",
    "--workdir",
    directory,
    "-x",
    "studio,realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor",
  ],
  { stdio: ["ignore", "pipe", "inherit"] },
);
execFileSync(
  "pnpm",
  ["exec", "supabase", "migration", "up", "--local", "--workdir", directory],
  { stdio: "inherit" },
);
const output = execFileSync(
  "pnpm",
  ["exec", "supabase", "status", "--workdir", directory, "-o", "json"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);
const env = JSON.parse(output);
const values = {
  NEXT_PUBLIC_SUPABASE_URL: env.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3101",
  CRON_SECRET: "local-fixture-cron-secret-at-least-32-characters",
  ATLAS_ENV: "test",
  ATLAS_TEST_WORKDIR: directory,
};
if (
  !values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  !values.SUPABASE_SERVICE_ROLE_KEY
)
  throw new Error("Test stack did not provide Auth keys");
await writeFile(
  ".env.test.local",
  Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n",
  { mode: 0o600 },
);
console.log("Isolated test environment written to ignored .env.test.local.");
