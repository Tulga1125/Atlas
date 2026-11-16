import { loadEnvFile } from "node:process";
import { execFileSync } from "node:child_process";
loadEnvFile(".env.test.local");
const workdir = process.env.ATLAS_TEST_WORKDIR;
if (!workdir?.includes("atlas-charts-test-"))
  throw new Error("Isolated test workdir required");
const cli = (args) =>
  execFileSync("pnpm", ["exec", "supabase", ...args, "--workdir", workdir], {
    stdio: "inherit",
  });
const sql = (input) =>
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
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input, encoding: "utf8" },
  );
console.log(
  "Recreating ONLY the isolated fixture database at the previous release migration.",
);
cli(["db", "reset", "--local", "--version", "20260830001000"]);
sql(`do $$ declare j uuid; entries jsonb; begin
 insert into public.collection_jobs(chart_id,idempotency_key,scheduled_for) values('00000000-0000-0000-0000-000000000010','upgrade-fixture',now()) returning id into j;
 select jsonb_agg(jsonb_build_object('rank',n,'itemId','fixture-song-'||n,'title','Fixture Song '||n,'artistName','Fixture Artist','artistId','123456789','url','https://music.apple.com/mn/song/'||n) order by n) into entries from generate_series(1,100) n;
 perform public.ingest_apple_music_snapshot(j,'2026-08-18',null,'upgrade-fixture','https://example.com/fixture','{}',entries);
end $$;`);
const checksum = () =>
  sql(
    "select count(*),md5(string_agg(to_jsonb(e)::text,'' order by id)) from public.chart_entries e;",
  );
const before = checksum();
cli(["migration", "up", "--local"]);
if (before !== checksum())
  throw new Error("Migration altered approved chart entries");
sql(
  "select public.enqueue_reprocessing('2026-08-18','Upgrade fixture calculation verification');",
);
console.log(
  "Existing approved chart entries survived the migration unchanged.",
);
