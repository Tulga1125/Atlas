import { appendFile } from "node:fs/promises";
const base = process.env.ATLAS_HEALTH_URL;
if (!base || !process.env.CRON_SECRET)
  throw new Error("ATLAS_HEALTH_URL and CRON_SECRET are required");
const response = await fetch(new URL("/api/internal/data-health", base), {
  headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  signal: AbortSignal.timeout(15000),
}).catch(() => null);
const body = response
  ? await response.json().catch(() => ({ error: "invalid_response" }))
  : { error: "unreachable" };
const result = {
  checkedAt: new Date().toISOString(),
  status: response?.status ?? 0,
  ...body,
};
if (process.env.ATLAS_HEALTH_LOG)
  await appendFile(
    process.env.ATLAS_HEALTH_LOG,
    JSON.stringify(result) + "\n",
    { mode: 0o600 },
  );
console.log(JSON.stringify(result, null, 2));
// This command only reports health. Connect an independently configured monitor
// to this exit status; it does not send messages or invent a notification target.
if (!response?.ok || !body.healthy) process.exitCode = 1;
