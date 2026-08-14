"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { hasPermission } from "@/lib/permissions/check";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function toggleNotificationTypeAction(
  settingId: string,
  enabled: boolean
) {
  await requireAdmin();

  const permitted = await hasPermission("notifications.manage");
  if (!permitted) {
    throw new Error("Forbidden");
  }

  const supabase = await createServerClient();
  await supabase
    .from("notification_settings" as never)
    .update({ is_enabled: enabled } as never)
    .eq("id" as never, settingId);

  revalidatePath("/admin/notifications");
}
