import { NextResponse, type NextRequest } from "next/server";
import { finishGoogleSignIn } from "@/lib/auth/google-finish";
import { markWelcome } from "@/lib/auth/welcome";
import { safeRedirectPath } from "@/lib/security/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth / PKCE code exchange. The post-login target is always a same-origin
 * path (SEC-008).
 *
 * Google is a way into an account the school already issued, never a way to
 * make one; what that means is in finishGoogleSignIn, shared with the sign-in
 * from the accounts on a phone.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const viaGoogle = url.searchParams.get("via") === "google";
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, url.origin));

  // Google or Supabase refused before there was a code: the person cancelled,
  // or sign-ups are closed and this address has no account.
  if (!code) {
    if (!viaGoogle) return redirectTo("/login?reason=link-invalid");
    const reason = url.searchParams.get("error_code") ?? url.searchParams.get("error") ?? "";
    return redirectTo(/signup|not_allowed|user_not_found/i.test(reason) ? "/login?reason=google-unknown" : "/login?reason=google-failed");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return redirectTo(viaGoogle ? "/login?reason=google-failed" : "/login?reason=link-invalid");

  if (viaGoogle) return redirectTo(await finishGoogleSignIn(supabase, data.user, url.searchParams.get("next")));

  // Two-step sign-in turned on: the second step before anything else.
  const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level?.currentLevel === "aal1" && level.nextLevel === "aal2") {
    const next = url.searchParams.get("next");
    return redirectTo(`/two-factor${next ? `?next=${encodeURIComponent(safeRedirectPath(next, "/dashboard"))}` : ""}`);
  }

  await markWelcome();
  return redirectTo(safeRedirectPath(url.searchParams.get("next"), "/dashboard"));
}
