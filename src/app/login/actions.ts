"use server";

import { createHash } from "node:crypto";
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
