import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Thread } from "@/features/messages/thread";
import { conversationTitle, type ConversationMember, type ThreadMessage } from "@/features/messages/types";
import { can } from "@/lib/auth/access";
import { requireModule } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { robots: { index: false } };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireModule("messages");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await getTranslations("portal.messages");
  const supabase = await createClient();

  // RLS returns the conversation only to its members.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, type, name, is_active")
    .eq("id", id)
    .maybeSingle();
  if (!conversation || !conversation.is_active) notFound();

  const [{ data: memberRows }, { data: messages }, { data: pinnedRows }, { data: blocks }] = await Promise.all([
    supabase
      .from("conversation_members")
      .select("user_id, role, is_muted, joined_at, users(first_name, last_name, avatar_url)")
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
  ]);
  await supabase.rpc("mark_conversation_read", { p_conversation_id: id });

  const members: ConversationMember[] = (memberRows ?? []).map((row) => {
    const user = row.users as { first_name: string; last_name: string; avatar_url: string | null } | null;
    return {
      user_id: row.user_id,
      role: row.role === "admin" ? "admin" : "member",
      first_name: user?.first_name ?? null,
      last_name: user?.last_name ?? null,
      avatar_url: user?.avatar_url ?? null,
    };
  });
  const me = (memberRows ?? []).find((m) => m.user_id === access.userId);
  if (!me) notFound();
  const myRole = me.role === "admin" ? "admin" : "member";
  const memberById = new Map(members.map((m) => [m.user_id, m]));

  const title = conversationTitle({ type: conversation.type, name: conversation.name, members }, access.userId, t("unknownUser"));
  const canPost = can(access, "messages.use") && (conversation.type !== "announcement" || myRole === "admin");

  return (
    <Thread
      key={id}
      conversation={{ id, type: conversation.type, title, isMuted: me.is_muted }}
      members={members}
      myRole={myRole}
      currentUserId={access.userId}
      initialMessages={(messages ?? []) as ThreadMessage[]}
      initialPinned={(pinnedRows ?? []).map((p) => ({
        id: p.id,
        content: p.content,
        sender_first_name: p.sender_id ? memberById.get(p.sender_id)?.first_name ?? null : null,
        sender_last_name: p.sender_id ? memberById.get(p.sender_id)?.last_name ?? null : null,
      }))}
      blockedUserIds={(blocks ?? []).map((b) => b.blocked_id)}
      canPost={canPost}
      canManageMembers={conversation.type === "group"}
      timeZone={access.school!.timezone}
    />
  );
}
