import { createHash, timingSafeEqual } from "node:crypto";

// Owner, 2026-11-17: quick staff sign-in. Typing "admin" as the email asks
// for an access code (ATLAS_ADMIN_CODE, a server secret); the right code
// signs in as the administrator account (ATLAS_ADMIN_EMAIL). Attempts are
// rate-limited in the database (5 per hour in total) and audited.

export const ADMIN_SHORTCUT = "admin";
export const MIN_CODE_LENGTH = 4;

export function isAdminShortcut(email: unknown) {
  return typeof email === "string" && email.trim().toLowerCase() === ADMIN_SHORTCUT;
}

/** Constant-time comparison; a missing or short configured code never matches. */
export function accessCodeMatches(given: unknown, expected: string | undefined) {
  if (typeof given !== "string" || !expected || expected.length < MIN_CODE_LENGTH) return false;
  const a = createHash("sha256").update(given.trim()).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** One shared rate-limit key: a guesser cannot spread attempts across names. */
export const ADMIN_LIMIT_KEY = createHash("sha256").update("atlas-admin-access-code").digest("hex");
