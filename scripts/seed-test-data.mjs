import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";
loadEnvFile(".env.test.local");
const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "55321")
  throw new Error("Fixtures require the isolated test stack on port 55321");
const db = createClient(url.href, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const password = "Atlas-fixture-password-2026!";
for (const role of [
  "administrator",
  "data_editor",
  "editor",
  "writer",
  "analyst",
]) {
  const email = `${role}@atlas.example`;
  const existing = await db.auth.admin.listUsers();
  if (existing.error) throw existing.error;
  let user = existing.data.users.find((u) => u.email === email);
  if (!user) {
    const result = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: `Fixture ${role}` },
    });
    if (result.error) throw result.error;
    user = result.data.user;
  }
  const updated = await db
    .from("profiles")
    .update({ role, active: true })
    .eq("id", user.id);
  if (updated.error) throw updated.error;
}
for (const date of ["2026-08-19", "2026-08-20", "2026-08-21"]) {
  const existing = await db
    .from("chart_snapshots")
    .select("id")
    .eq("snapshot_date", date)
    .eq("status", "approved");
  if (existing.error) throw existing.error;
  if (existing.data.length) continue;
  const job = await db
    .from("collection_jobs")
    .insert({
      chart_id: "00000000-0000-0000-0000-000000000010",
      idempotency_key: `fixture:${date}`,
      scheduled_for: `${date}T06:00:00+08:00`,
    })
    .select("id")
    .single();
  if (job.error) throw job.error;
  const entries = Array.from({ length: 100 }, (_, i) => ({
    rank: i + 1,
    itemId:
      date === "2026-08-21" && i === 99
        ? "new-fixture-song"
        : `fixture-song-${i + 1}`,
    title: `Fixture Song ${i + 1}`,
    artistName: "Fixture Artist",
    artistId: "123456789",
    url: `https://music.apple.com/mn/song/${i + 1}`,
    artists: [{ id: "123456789", name: "Fixture Artist" }],
  }));
  const snapshot = await db.rpc("ingest_apple_music_snapshot", {
    p_job_id: job.data.id,
    p_snapshot_date: date,
    p_source_timestamp: null,
    p_checksum: `fixture-${date}`,
    p_source_url: "https://example.com/atlas-fixture",
    p_payload: { fixture: true, entries },
    p_entries: entries,
  });
  if (snapshot.error) throw snapshot.error;
  const queued = await db.from("pipeline_jobs").insert({
    kind: "calculate",
    business_date: date,
    snapshot_id: snapshot.data,
    idempotency_key: `fixture:calculate:${date}`,
  });
  if (queued.error) throw queued.error;
}
const imported = await db.rpc("import_musicbrainz_artists", {
  p_payload: { source: "musicbrainz", query: "country:MN", fetchedAt: "2026-09-06T00:00:00Z", count: 1,
    artists: [{ id: "90000000-0000-4000-8000-000000000050", name: "Source Fixture Artist", country: "MN", type: "Person" }] },
  p_curated: [{ mbid: "90000000-0000-4000-8000-000000000050", name: "Source Fixture Artist", biography: "An isolated browser-test artist with no chart history.", sourceUrl: "https://example.com/fixture-artist", sourceName: "Fixture source", evidenceType: "official_profile", notes: "Test-only identity for browser assertions.", checkedAt: "2026-09-06" }],
});
if (imported.error) throw imported.error;
console.log(
  "Five local staff accounts and three historical chart fixtures are ready.",
);
