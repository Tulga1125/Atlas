import { loadEnvFile } from "node:process";
import { execFileSync } from "node:child_process";
loadEnvFile(".env.test.local");
execFileSync("pnpm", ["build"], {
  stdio: "inherit",
  env: { ...process.env, ATLAS_ENV: "test" },
});
