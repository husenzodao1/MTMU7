import { NextResponse, type NextRequest } from "next/server";
import { isAppUserAgent } from "@/lib/native/app";
import { postSignInPath } from "@/lib/security/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * "Sign in with Google": off to Google, and back to /auth/callback.
 *
 * A link rather than a form, so that nothing about the site's form-action
 * policy stands between the button and Google's own page. The PKCE verifier
 * Supabase needs to finish the exchange is written to a cookie here, which a
 * Route Handler — unlike a Server Component — is allowed to do.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = postSignInPath(url.searchParams.get("next"));
  // In the phone app Google's page opens in the system browser — Google will
  // not sign anybody in inside an app's web view — and the way back into the
  // app is /auth/app-return. The verifier cookie set below stays in the app,
  // which is where the code is finally exchanged.
  const inApp = isAppUserAgent(request.headers.get("user-agent"));
  const callback = new URL(inApp ? "/auth/app-return" : "/auth/callback", url.origin);
  callback.searchParams.set("via", "google");
  if (next !== "/dashboard") callback.searchParams.set("next", next);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback.toString(),
      skipBrowserRedirect: true,
      // Always the account chooser: on a family computer the Google account
      // that happens to be signed in is often somebody else's.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) {
    return NextResponse.redirect(new URL("/login?reason=google-failed", url.origin));
  }
  return NextResponse.redirect(data.url);
}
