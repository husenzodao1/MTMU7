import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath } from "@/lib/security/redirect";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_TYPES: EmailOtpType[] = ["email", "signup", "recovery", "invite", "magiclink", "email_change"];

/**
 * Email link confirmation (token_hash flow configured in Supabase email
 * templates). Replaces the missing /verify route (FUN: "missing verify route").
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const fallback = type === "recovery" ? "/reset-password?step=password" : "/dashboard";
  const next = safeRedirectPath(url.searchParams.get("next"), fallback);

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?reason=link-invalid", url.origin));
}
