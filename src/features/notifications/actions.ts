"use server";

import { revalidatePath } from "next/cache";
import { done, failure, success, type FormState } from "@/lib/actions/result";
import { mapDbError } from "@/lib/actions/errors";
import { getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export async function markAllNotificationsReadAction(_state: FormState): Promise<FormState> {
  const access = await getAccess();
  if (!access) return done(failure("errors.not_authenticated"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", access.userId)
    .eq("is_read", false);
  if (error) return done(mapDbError(error));
  revalidatePath("/", "layout");
  return done(success("portal.notifications.allRead"));
}

export async function deleteReadNotificationsAction(_state: FormState): Promise<FormState> {
  const access = await getAccess();
  if (!access) return done(failure("errors.not_authenticated"));
  const supabase = await createClient();
  // RLS only permits deleting the user's own notifications that are already read.
  const { error } = await supabase.from("notifications").delete().eq("user_id", access.userId).eq("is_read", true);
  if (error) return done(mapDbError(error));
  revalidatePath("/notifications");
  return done(success("portal.notifications.cleared"));
}
