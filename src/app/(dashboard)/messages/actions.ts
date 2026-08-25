"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
    .select("conversation_id, last_read_at" as never)
    .eq("user_id" as never, user.id);

  if (!memberships || memberships.length === 0) return [];

  const myMemberships = memberships as Array<{ conversation_id: string; last_read_at: string | null }>;
  const conversationIds = myMemberships.map((m) => m.conversation_id);
  const lastReadMap = new Map<string, string | null>();
  for (const m of myMemberships) {
    lastReadMap.set(m.conversation_id, m.last_read_at);
  }

  const admin = createAdminClient();

  const [convResult, membersResult] = await Promise.all([
    admin
      .from("conversations" as never)
      .select("id, type, name, avatar_url, class_id, is_active, updated_at" as never)
      .in("id" as never, conversationIds)
      .eq("is_active" as never, true)
      .order("updated_at" as never, { ascending: false }),
    admin
      .from("conversation_members" as never)
      .select("conversation_id, user_id, role" as never)
      .in("conversation_id" as never, conversationIds),
  ]);

  const conversations = (convResult.data as Array<Record<string, unknown>>) ?? [];
  if (conversations.length === 0) return [];

  const activeConvIds = conversations.map((c) => c.id as string);

  const allMemberUserIds = new Set<string>();
  const membersByConv = new Map<string, Array<{ user_id: string; role: string }>>();
  for (const m of (membersResult.data as Array<Record<string, unknown>>) ?? []) {
    const cid = m.conversation_id as string;
    if (!activeConvIds.includes(cid)) continue;
    allMemberUserIds.add(m.user_id as string);
    if (!membersByConv.has(cid)) membersByConv.set(cid, []);
    membersByConv.get(cid)!.push({ user_id: m.user_id as string, role: m.role as string });
  }

  const [usersResult, lastMsgsResult] = await Promise.all([
    admin
      .from("users" as never)
      .select("id, first_name, last_name, avatar_url" as never)
      .in("id" as never, Array.from(allMemberUserIds)),
    admin
      .from("messages" as never)
      .select("conversation_id, content, sender_id, created_at, type" as never)
      .in("conversation_id" as never, activeConvIds)
      .eq("is_deleted" as never, false)
      .order("created_at" as never, { ascending: false }),
  ]);

  const usersMap = new Map<string, { first_name: string; last_name: string; avatar_url: string | null }>();
  for (const u of (usersResult.data as Array<Record<string, unknown>>) ?? []) {
    usersMap.set(u.id as string, {
      first_name: u.first_name as string,
      last_name: u.last_name as string,
      avatar_url: u.avatar_url as string | null,
    });
  }

  const lastMsgMap = new Map<string, Record<string, unknown>>();
  for (const msg of (lastMsgsResult.data as Array<Record<string, unknown>>) ?? []) {
    const cid = msg.conversation_id as string;
    if (!lastMsgMap.has(cid)) lastMsgMap.set(cid, msg);
  }

  return conversations.map((conv) => {
    const convId = conv.id as string;
    const convMembers = membersByConv.get(convId) ?? [];

    const membersList = convMembers.slice(0, 5).map((m) => {
      const u = usersMap.get(m.user_id);
      return {
        userId: m.user_id,
        firstName: u?.first_name ?? "",
        lastName: u?.last_name ?? "",
        avatarUrl: u?.avatar_url ?? null,
        role: m.role,
      };
    });

    const lastMsg = lastMsgMap.get(convId);
    const lastReadAt = lastReadMap.get(convId);

    let unreadCount = 0;
    if (lastReadAt && lastMsg) {
      for (const msg of (lastMsgsResult.data as Array<Record<string, unknown>>) ?? []) {
        if ((msg.conversation_id as string) !== convId) continue;
        if ((msg.created_at as string) > lastReadAt) {
          unreadCount++;
        } else {
          break;
        }
      }
    }

    return {
      id: convId,
      type: conv.type as string,
      name: conv.name as string | null,
      avatarUrl: conv.avatar_url as string | null,
      classId: conv.class_id as string | null,
      isActive: conv.is_active as boolean,
      updatedAt: conv.updated_at as string,
      lastMessage: lastMsg
        ? {
            content: lastMsg.content as string,
            senderId: lastMsg.sender_id as string,
            createdAt: lastMsg.created_at as string,
            type: lastMsg.type as string,
          }
        : null,
      unreadCount,
      members: membersList,
    };
  });
}
