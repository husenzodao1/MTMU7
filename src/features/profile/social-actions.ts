"use server";

import { revalidatePath } from "next/cache";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, keepValues, success, type ActionResult, type FormState } from "@/lib/actions/result";
import { getAccess } from "@/lib/auth/access";
import { isSocialPlatform, readAccount } from "@/lib/social/accounts";
import { createClient } from "@/lib/supabase/server";
import { checkAccount } from "@/features/profile/account-check";

/**
 * An account elsewhere, added to one's own profile (00101): read from what
 * was typed (a name, @name, the page's address, or a Telegram number), looked
 * up on its service first, and refused when the service says there is no such
 * account. One per service; adding another replaces it.
 */
export async function saveSocialAccountAction(_state: FormState, formData: FormData): Promise<FormState> {
  const kept = keepValues(formData);
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const platform = formData.get("platform");
  if (!isSocialPlatform(platform)) return done(failure("errors.validation", { platform: ["validation.required"] }, kept));
  const read = readAccount(platform, String(formData.get("handle") ?? ""));
  if (!read.ok) {
    const reason = read.error === "empty" ? "validation.required" : `portal.profile.accounts.${read.error}`;
    return done(failure("errors.validation", { handle: [reason] }, kept));
  }

  const check = await checkAccount({ platform, handle: read.handle });
  if (check === "missing") return done(failure("errors.validation", { handle: ["portal.profile.accounts.missing"] }, kept));

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_social_accounts")
    .upsert({ user_id: access.userId, school_id: access.school.id, platform, handle: read.handle, updated_at: new Date().toISOString() }, { onConflict: "user_id,platform" });
  if (error) return done(mapDbError(error));
  revalidatePath("/profile");
  return done(success(check === "found" ? "portal.profile.accounts.saved" : "portal.profile.accounts.savedUnchecked"));
}

export async function removeSocialAccountAction(platform: string): Promise<ActionResult> {
  const access = await getAccess();
  if (!access?.school) return failure("errors.not_authenticated");
  if (!isSocialPlatform(platform)) return failure("errors.invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("user_social_accounts").delete().eq("user_id", access.userId).eq("platform", platform);
  if (error) return mapDbError(error);
  revalidatePath("/profile");
  return success("portal.profile.accounts.removed");
}
