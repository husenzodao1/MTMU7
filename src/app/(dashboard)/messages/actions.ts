"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { canPerformAction } from "@/lib/modules/check";
import { redirect } from "next/navigation";

export async function getConversations() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canRead = await canPerformAction("messages", "messages.read");
  if (!canRead) return [];

  const supabase = await createServerClient();

  const { data: memberships } = await supabase
    .from("conversation_members" as never)
    .select("conversation_id" as never)
    .eq("user_id" as never, user.id);

  if (!memberships || memberships.length === 0) return [];

  const conversationIds = (
    memberships as Array<{ conversation_id: string }>
  ).map((m) => m.conversation_id);

  const { data: conversations } = await supabase
    .from("conversations" as never)
    .select("*" as never)
    .in("id" as never, conversationIds)
    .eq("is_active" as never, true)
    .order("updated_at" as never, { ascending: false });

  if (!conversations) return [];

  const result = [];
  for (const conv of conversations as Array<Record<string, unknown>>) {
    const { data: lastMsg } = await supabase
      .from("messages" as never)
      .select("content, sender_id, created_at, type" as never)
      .eq("conversation_id" as never, conv.id as never)
      .eq("is_deleted" as never, false)
      .order("created_at" as never, { ascending: false })
      .limit(1)
      .single();

    const { data: membership } = await supabase
      .from("conversation_members" as never)
      .select("last_read_at" as never)
      .eq("conversation_id" as never, conv.id as never)
      .eq("user_id" as never, user.id)
      .single();

    const lastReadAt = (membership as Record<string, unknown> | null)
      ?.last_read_at as string | null;

    let unreadCount = 0;
    if (lastReadAt) {
      const { count } = await supabase
        .from("messages" as never)
        .select("id" as never, { count: "exact", head: true })
        .eq("conversation_id" as never, conv.id as never)
        .eq("is_deleted" as never, false)
        .gt("created_at" as never, lastReadAt);
      unreadCount = count ?? 0;
    }

    const { data: members } = await supabase
      .from("conversation_members" as never)
      .select(
        `
        user_id,
        role,
        users!inner(first_name, last_name, avatar_url)
      ` as never
      )
      .eq("conversation_id" as never, conv.id as never)
      .limit(5);

    const membersList =
      (members as Array<Record<string, unknown>> | null)?.map((m) => {
        const u = m.users as Record<string, unknown>;
        return {
          userId: m.user_id as string,
          firstName: u.first_name as string,
          lastName: u.last_name as string,
          avatarUrl: u.avatar_url as string | null,
          role: m.role as string,
        };
      }) ?? [];

    const lastMessage = lastMsg as Record<string, unknown> | null;

    result.push({
      id: conv.id as string,
      type: conv.type as string,
      name: conv.name as string | null,
      avatarUrl: conv.avatar_url as string | null,
      classId: conv.class_id as string | null,
      isActive: conv.is_active as boolean,
      updatedAt: conv.updated_at as string,
      lastMessage: lastMessage
        ? {
            content: lastMessage.content as string,
            senderId: lastMessage.sender_id as string,
            createdAt: lastMessage.created_at as string,
            type: lastMessage.type as string,
          }
        : null,
      unreadCount,
      members: membersList,
    });
  }

  return result;
}
