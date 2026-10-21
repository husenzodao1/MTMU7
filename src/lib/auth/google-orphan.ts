import "server-only";
import { createPrivilegedClient } from "@/lib/supabase/privileged";

/**
 * Removes the sign-in Supabase created for a Google address the school has
 * never heard of.
 *
 * With sign-ups open, a Google address that matches no account becomes a new,
 * empty auth user. It can open nothing — every page and every policy wants a
 * row in public.users — but left there it would sit in the auth list for ever
 * and, worse, would be the account a later genuine one had to be linked to.
 *
 * Deleted only when all four hold, checked with the service key: no portal
 * account, no registration request, Google as its one and only way in, and
 * created in the last ten minutes. Anything else is somebody's real sign-in
 * and is left alone.
 */
export async function removeGoogleOrphan(userId: string): Promise<void> {
  try {
    const admin = createPrivilegedClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user) return;
    const user = data.user;
    const identities = user.identities ?? [];
    const onlyGoogle = identities.length === 1 && identities[0]?.provider === "google";
    const fresh = Date.now() - new Date(user.created_at).getTime() < 10 * 60 * 1000;
    if (!onlyGoogle || !fresh) return;

    const [{ data: profile }, { data: request }] = await Promise.all([
      admin.from("users").select("id").eq("id", userId).maybeSingle(),
      admin.from("registration_requests").select("id").eq("auth_user_id", userId).limit(1).maybeSingle(),
    ]);
    if (profile || request) return;

    await admin.auth.admin.deleteUser(userId);
  } catch (error) {
    console.error("[google] could not remove an unmatched sign-in", { error: error instanceof Error ? error.message : "unknown" });
  }
}
