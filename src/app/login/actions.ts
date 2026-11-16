"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { ADMIN_LIMIT_KEY, accessCodeMatches, isAdminShortcut } from "@/modules/auth/admin-code";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocale } from "@/modules/i18n/server";

export type LoginState = {
  error?: string;
  success?: string;
};

export async function requestMagicLink(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const email = formData.get("email");

  if (isAdminShortcut(email)) return adminCodeSignIn(formData.get("code"), dictionary);

  if (!z.email().max(254).safeParse(email).success) {
    return { error: dictionary.login.invalidEmail };
  }

  try {
    const address = String(email).trim().toLowerCase();
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const limit = await createAdminClient().rpc("consume_auth_limit", {
        p_key: createHash("sha256").update(address).digest("hex"),
      });
      if (limit.error || !limit.data)
        return { success: dictionary.login.success };
    }
    const supabase = await createServerSupabaseClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback`,
        shouldCreateUser: false,
      },
    });

    if (error) {
      console.error("Atlas magic-link request failed", error.message);
    }

    return {
      success: dictionary.login.success,
    };
  } catch {
    return { error: dictionary.login.unavailable };
  }
}

/**
 * "admin" + access code (owner, 2026-11-17). Signs in as the administrator
 * account without email: a one-time token is minted server-side and verified
 * at once, so the session cookie is set like any magic-link sign-in.
 */
async function adminCodeSignIn(code: FormDataEntryValue | null, dictionary: ReturnType<typeof getDictionary>): Promise<LoginState> {
  const expected = process.env.ATLAS_ADMIN_CODE;
  const email = process.env.ATLAS_ADMIN_EMAIL ?? "admin@atlas.tagent.space";
  if (!expected || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: dictionary.login.unavailable };
  if (typeof code !== "string" || code.trim() === "") return { error: dictionary.login.codeRequired };
  const admin = createAdminClient();
  // Every attempt counts against one shared limit: 5 per hour.
  const limit = await admin.rpc("consume_auth_limit", { p_key: ADMIN_LIMIT_KEY });
  if (limit.error || !limit.data) return { error: dictionary.login.tooManyAttempts };
  if (!accessCodeMatches(code, expected)) {
    await admin.from("audit_logs").insert({ action: "auth.admin_code_failed", entity_type: "auth", entity_id: "admin", reason: "Wrong access code" });
    return { error: dictionary.login.wrongCode };
  }
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) return { error: dictionary.login.unavailable };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
  if (error) return { error: dictionary.login.unavailable };
  await admin.from("audit_logs").insert({ action: "auth.admin_code_sign_in", entity_type: "auth", entity_id: "admin", reason: "Signed in with the admin access code" });
  redirect("/dashboard");
}
