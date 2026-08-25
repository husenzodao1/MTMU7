"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export interface NotificationItem {
  id: string;
  type: string;
  module: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  linkUrl: string | null;
}

export async function getNotifications(): Promise<NotificationItem[]> {
  const user = await getUserWithRole();
  if (!user) return [];

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("notifications" as never)
    .select("*" as never)
    .eq("user_id" as never, user.id)
    .order("created_at" as never, { ascending: false })
    .limit(100);

  if (!data) return [];

  return (data as Array<Record<string, unknown>>).map((n) => {
    const d = n.data as Record<string, unknown> | null;
    let linkUrl: string | null = null;

    if (n.type === "friend" && d) {
      const userId = (d.senderId ?? d.accepterId) as string | undefined;
      if (userId) linkUrl = `/profile/${userId}`;
    }

    return {
      id: n.id as string,
      type: n.type as string,
      module: n.module as string,
      title: n.title as string,
      body: n.body as string | null,
      data: d,
      isRead: n.is_read as boolean,
      readAt: n.read_at as string | null,
      createdAt: n.created_at as string,
      linkUrl,
    };
  });
}

export async function markAsRead(notificationId: string): Promise<void> {
  const user = await getUserWithRole();
  if (!user) return;

  const supabase = await createServerClient();

  const { data: notif } = await supabase
    .from("notifications" as never)
    .select("type, data" as never)
    .eq("id" as never, notificationId)
    .eq("user_id" as never, user.id)
    .single();

  await supabase
    .from("notifications" as never)
    .update({ is_read: true, read_at: new Date().toISOString() } as never)
    .eq("id" as never, notificationId)
    .eq("user_id" as never, user.id);

  revalidatePath("/notifications");

  const n = notif as Record<string, unknown> | null;
  if (n?.type === "friend") {
    const d = n.data as Record<string, unknown> | null;
    const userId = (d?.senderId ?? d?.accepterId) as string | undefined;
    if (userId) redirect(`/profile/${userId}`);
  }
}

export async function markAllAsRead(): Promise<void> {
  const user = await getUserWithRole();
  if (!user) return;

  const supabase = await createServerClient();
  await supabase
    .from("notifications" as never)
    .update({ is_read: true, read_at: new Date().toISOString() } as never)
    .eq("user_id" as never, user.id)
    .eq("is_read" as never, false);

  revalidatePath("/notifications");
}

export async function deleteReadNotifications(): Promise<void> {
  const user = await getUserWithRole();
  if (!user) return;

  const supabase = await createServerClient();
  await supabase
    .from("notifications" as never)
    .delete()
    .eq("user_id" as never, user.id)
    .eq("is_read" as never, true);

  revalidatePath("/notifications");
}

export async function getUnreadCount(): Promise<number> {
  const user = await getUserWithRole();
  if (!user) return 0;

  const supabase = await createServerClient();
  const { count } = await supabase
    .from("notifications" as never)
    .select("id" as never, { count: "exact", head: true })
    .eq("user_id" as never, user.id)
    .eq("is_read" as never, false);

  return count ?? 0;
}
