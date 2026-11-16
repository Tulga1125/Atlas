import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const script = (
  await readFile("supabase/operations/install-schedule.sql", "utf8")
)
  .replace(
    "begin;",
    `begin;
select vault.create_secret('https://atlas-fixture.example.invalid','atlas_site_url');
select vault.create_secret('fixture-scheduler-token-at-least-32-characters','atlas_cron_secret');`,
  )
  .replace("commit;", "rollback;");
execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "supabase_db_atlas-charts-test",
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  { input: script, stdio: ["pipe", "pipe", "pipe"] },
);
console.log(
  "Schedule installation validated and rolled back; no timers or requests installed.",
);
