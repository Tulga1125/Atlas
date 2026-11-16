import { cp } from "node:fs/promises";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { execFileSync } from "node:child_process";
loadEnvFile(".env.test.local");
if (!process.env.ATLAS_TEST_WORKDIR?.includes("atlas-charts-test-"))
  throw new Error("Isolated test workdir required");
await cp(
  "supabase/tests",
  join(process.env.ATLAS_TEST_WORKDIR, "supabase/tests"),
  { recursive: true },
);
execFileSync(
  "pnpm",
  [
    "exec",
    "supabase",
    "test",
    "db",
    "--workdir",
    process.env.ATLAS_TEST_WORKDIR,
  ],
  { stdio: "inherit" },
);
