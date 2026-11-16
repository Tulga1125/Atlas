import { spawn } from "node:child_process";
import { loadEnvFile } from "node:process";
loadEnvFile(".env.test.local");
const testUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
if (!["127.0.0.1", "localhost"].includes(testUrl.hostname) || testUrl.port !== "55321")
  throw new Error("Browser tests require the isolated database on 55321");
const live = process.argv[2] === "live";
const child = spawn(
  "pnpm",
  [
    "exec",
    "next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    live ? "3101" : "3100",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      ATLAS_ENV: "test",
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
