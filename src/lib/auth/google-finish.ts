import "server-only";
import type { User } from "@supabase/supabase-js";
import { getAccess } from "@/lib/auth/access";
import { removeGoogleOrphan } from "@/lib/auth/google-orphan";
import { markWelcome } from "@/lib/auth/welcome";
import { serverEnv } from "@/lib/env.server";
import { postSignInPath, safeRedirectPath } from "@/lib/security/redirect";
import type { createClient } from "@/lib/supabase/server";

type Server = Awaited<ReturnType<typeof createClient>>;

/**
 * What happens once Google has vouched for somebody, whichever way they came:
 * through the browser (/auth/callback) or from the accounts on the phone
 * (/auth/google/native). Returns where to send them.
 *
 * Google is a way into an account the school already issued, never a way to
 * make one. When the address matches no account, the visitor is signed
 * straight back out, whatever Supabase created for them is removed, and the
 * sign-in page says the address was not recognised and whom to ask.
 */
export async function finishGoogleSignIn(supabase: Server, user: User, next: string | null): Promise<string> {
  // Two-step sign-in turned on: before anything else — and certainly before
  // deciding the account does not exist, which is what getAccess says while
  // the second step is owed.
  const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level?.currentLevel === "aal1" && level.nextLevel === "aal2") {
    return `/two-factor${next ? `?next=${encodeURIComponent(safeRedirectPath(next, "/dashboard"))}` : ""}`;
  }

  const access = await getAccess();
  if (!access) {
    await supabase.auth.signOut();
    if (serverEnv.SUPABASE_SERVICE_ROLE_KEY) await removeGoogleOrphan(user.id);
    return "/login?reason=google-unknown";
  }
  if (!access.isActive || access.status === "blocked") {
    await supabase.auth.signOut();
    return "/login?reason=google-inactive";
  }
  await markWelcome();
  return postSignInPath(next);
}
