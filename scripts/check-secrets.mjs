import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const patterns = [
  /-----BEGIN (?:EC |RSA |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:sb_secret_|sk_live_|ghp_|github_pat_)[A-Za-z0-9_]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/,
];
const violations = [];
for (const file of new Set(files)) {
  if (/\.(?:pdf|png|jpe?g|woff2?|ico)$/.test(file)) continue;
  const body = await readFile(file, "utf8").catch(() => null);
  if (body === null) continue;
  if (patterns.some((pattern) => pattern.test(body))) violations.push(file);
  if (/^\.env(?:\.|$)/.test(file) && file !== ".env.example")
    violations.push(file);
}
if (violations.length) {
  console.error(
    "Potential credentials found in:",
    [...new Set(violations)].join(", "),
  );
  process.exitCode = 1;
} else
  console.log(
    "No private keys, provider tokens, or local environment files found in tracked/publishable files.",
  );
