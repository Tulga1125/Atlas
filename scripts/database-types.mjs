import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
const args = ["exec", "supabase", "gen", "types", "typescript", "--local"];
if (process.argv.includes("--test")) {
  loadEnvFile(".env.test.local");
  args.push("--workdir", process.env.ATLAS_TEST_WORKDIR);
}
const result =
  execFileSync("pnpm", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 4 * 1024 * 1024,
  }).trimEnd() + "\n";
const path = "src/lib/supabase/database.types.ts";
if (!result.includes("export type Database"))
  throw new Error("No generated database schema returned");
if (process.argv.includes("--check")) {
  if (result !== (await readFile(path, "utf8")))
    throw new Error(
      "Database types changed. Run pnpm db:types and include the generated file.",
    );
} else await writeFile(path, result);
