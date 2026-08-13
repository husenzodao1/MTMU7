"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { isModuleAccessible } from "@/lib/modules/check";

export interface DashboardStats {
  totalUsers: number;
  unreadNotifications: number;
  totalMessages: number | null;
  totalLibraryItems: number | null;
}

export async function getDashboardStats(): Promise<DashboardStats | null> {
  const user = await getUserWithRole();
  if (!user) return null;

  const supabase = await createServerClient();

  const [usersResult, notificationsResult, canAccessMessages, canAccessLibrary] =
    await Promise.all([
      supabase
        .from("users" as never)
        .select("id" as never, { count: "exact", head: true })
        .eq("school_id" as never, user.schoolId)
        .eq("is_active" as never, true),
      supabase
        .from("notifications" as never)
        .select("id" as never, { count: "exact", head: true })
        .eq("user_id" as never, user.id)
        .eq("is_read" as never, false),
      isModuleAccessible("messages"),
      isModuleAccessible("library"),
    ]);

  let totalMessages: number | null = null;
  if (canAccessMessages) {
    const { count } = await supabase
      .from("messages" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("school_id" as never, user.schoolId);
    totalMessages = count ?? 0;
  }

  let totalLibraryItems: number | null = null;
  if (canAccessLibrary) {
    const { count } = await supabase
      .from("library_items" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("school_id" as never, user.schoolId)
      .eq("is_published" as never, true);
    totalLibraryItems = count ?? 0;
  }

  return {
    totalUsers: usersResult.count ?? 0,
    unreadNotifications: notificationsResult.count ?? 0,
    totalMessages,
    totalLibraryItems,
  };
}
