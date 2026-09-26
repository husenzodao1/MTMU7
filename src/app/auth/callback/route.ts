import { NextResponse, type NextRequest } from "next/server";
import { getAccess } from "@/lib/auth/access";
import { removeGoogleOrphan } from "@/lib/auth/google-orphan";
import { serverEnv } from "@/lib/env.server";
import { postSignInPath, safeRedirectPath } from "@/lib/security/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth / PKCE code exchange. The post-login target is always a same-origin
 * path (SEC-008).
 *
 * Google is a way into an account the school already issued, never a way to
 * make one. Supabase links a Google sign-in to the account with the same
 * address by itself; when there is no such account, the visitor is signed
 * straight back out, whatever Supabase created for them is removed, and the
 * sign-in page says the address was not recognised and whom to ask.
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

  if (viaGoogle) {
    const access = await getAccess();
    if (!access) {
      const userId = data.user.id;
      await supabase.auth.signOut();
      if (serverEnv.SUPABASE_SERVICE_ROLE_KEY) await removeGoogleOrphan(userId);
      return redirectTo("/login?reason=google-unknown");
    }
    if (!access.isActive || access.status === "blocked") {
      await supabase.auth.signOut();
      return redirectTo("/login?reason=google-inactive");
    }
    return redirectTo(postSignInPath(url.searchParams.get("next")));
  }

  return redirectTo(safeRedirectPath(url.searchParams.get("next"), "/dashboard"));
}
