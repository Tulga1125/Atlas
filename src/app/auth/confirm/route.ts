import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSafeStaffRedirect } from "@/modules/auth/redirect";

// One-time sign-in links that carry a token hash (Supabase's server-side
// pattern). Used by email templates and by links an administrator generates
// with the Auth admin API while email is not configured (docs/OPERATIONS.md).
const TYPES = new Set<EmailOtpType>(["magiclink", "email", "invite", "recovery"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? url.origin).origin;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = getSafeStaffRedirect(url.searchParams.get("next"));

  if (tokenHash && type && TYPES.has(type)) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(new URL("/login?error=callback", origin));
}
