import "server-only";
import type { ComponentProps } from "react";
import { getTranslations } from "next-intl/server";
import type { Thread } from "@/features/messages/thread";
import { conversationTitle, type ConversationMember, type ThreadMessage } from "@/features/messages/types";
import { can, type Access } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

/**
 * Everything a conversation page needs to draw one thread, in one round of
 * parallel queries. Returns null when the caller is not a member or the
 * conversation is gone — row level security answers both.
 *
 * Shared by /messages/[id] and the support chat, which are the same thread
 * with a different frame around it.
 */
export async function loadThread(access: Access, id: string): Promise<ComponentProps<typeof Thread> | null> {
  const t = await getTranslations("portal.messages");
  const supabase = await createClient();

  const [{ data: conversation }, { data: memberRows }, { data: messages }, { data: pinnedRows }, { data: blocks }] = await Promise.all([
    supabase.from("conversations").select("id, type, name, is_active, created_by").eq("id", id).maybeSingle(),
    supabase
      .from("conversation_members")
      .select("user_id, role, is_muted, joined_at, last_read_at, users(first_name, last_name, avatar_url)")
      .eq("conversation_id", id)
      .order("joined_at"),
    supabase.rpc("get_conversation_messages", { p_conversation_id: id, p_limit: 50 }),
    supabase
      .from("messages")
      .select("id, content, sender_id, created_at")
      .eq("conversation_id", id)
      .eq("is_pinned", true)
      .eq("is_deleted", false)
      .order("created_at")
      .limit(20),
    supabase.from("user_blocks").select("blocked_id").eq("blocker_id", access.userId),
    // Opening the thread is reading it. Alongside the reads rather than after
    // them: it touches only the caller's own membership row, so for somebody
    // who is not a member it changes nothing.
    supabase.rpc("mark_conversation_read", { p_conversation_id: id }),
  ]);
  if (!conversation || !conversation.is_active) return null;
  const me = (memberRows ?? []).find((m) => m.user_id === access.userId);
  if (!me) return null;

  const members: ConversationMember[] = (memberRows ?? []).map((row) => {
    const user = row.users as { first_name: string; last_name: string; avatar_url: string | null } | null;
    return {
      user_id: row.user_id,
      role: row.role === "admin" ? "admin" : "member",
      first_name: user?.first_name ?? null,
      last_name: user?.last_name ?? null,
      avatar_url: user?.avatar_url ?? null,
      last_read_at: row.last_read_at,
    };
  });
  const myRole = me.role === "admin" ? "admin" : "member";
  const memberById = new Map(members.map((m) => [m.user_id, m]));

  // The person who asked the desk sees "Online support"; the desk sees who is
  // asking. Posting into your own support conversation needs no messaging
  // permission — the database says the same.
  const isSupport = conversation.type === "support";
  const askedByMe = isSupport && conversation.created_by === access.userId;
  const title = askedByMe
    ? t("supportTitle")
    : conversationTitle({ type: conversation.type, name: conversation.name, members }, access.userId, t("unknownUser"));
  const canPost = isSupport || (can(access, "messages.use") && (conversation.type !== "announcement" || myRole === "admin"));

  return {
    conversation: {
      id,
      type: conversation.type,
      title,
      isMuted: me.is_muted,
      createdBy: conversation.created_by,
      subtitle: isSupport ? (askedByMe ? t("supportSubtitle") : t("supportDeskSubtitle")) : undefined,
    },
    members,
    myRole,
    currentUserId: access.userId,
    initialMessages: (messages ?? []) as ThreadMessage[],
    initialPinned: (pinnedRows ?? []).map((p) => ({
      id: p.id,
      content: p.content,
      sender_first_name: p.sender_id ? memberById.get(p.sender_id)?.first_name ?? null : null,
      sender_last_name: p.sender_id ? memberById.get(p.sender_id)?.last_name ?? null : null,
    })),
    blockedUserIds: (blocks ?? []).map((b) => b.blocked_id),
    canPost,
    canManageMembers: conversation.type === "group",
    canMessage: can(access, "messages.use"),
    timeZone: access.school!.timezone,
    schoolId: access.school!.id,
  };
}
