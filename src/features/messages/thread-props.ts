"use client";

import type { ComponentProps } from "react";
import { keepRun, keepThread, keptMessages } from "@/features/messages/local-store";
import type { Thread } from "@/features/messages/thread";
import { conversationTitle, isBroadcast, type ConversationMember, type ThreadMessage } from "@/features/messages/types";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * A conversation's screen, kept on the device so it opens at the tap, as a
 * messenger's does: everything the thread is drawn from apart from its
 * messages, which have their own store (local-store.ts). Kept whenever the
 * thread is drawn from the server (thread.tsx), and fetched ahead for the
 * conversations of the list that have none yet (messages-frame.tsx) — with
 * the same queries the server's page makes (load-thread.ts), under the same
 * row level security, so nothing is shown here that the page would not show.
 */
export type ThreadProps = Omit<ComponentProps<typeof Thread>, "initialMessages">;

/** What is the same in every conversation of one person: from the messenger's own page (messages/layout.tsx). */
export interface ThreadBase {
  currentUserId: string;
  timeZone: string;
  schoolId: string;
  /** In the messenger's frame always true: its page lets in nobody else (messages.use). */
  canMessage: boolean;
}

export interface ThreadLabels {
  supportTitle: string;
  supportSubtitle: string;
  supportDeskSubtitle: string;
  unknownUser: string;
}

export function rememberThread(props: ThreadProps): void {
  void keepThread(props.currentUserId, props.conversation.id, props);
}

interface MemberRow {
  conversation_id: string;
  user_id: string;
  role: string;
  is_muted: boolean;
  joined_at: string;
  last_read_at: string | null;
  last_delivered_at?: string | null;
  cleared_at?: string | null;
  users: { first_name: string; last_name: string; avatar_url: string | null } | null;
}

const MEMBER_COLUMNS = "conversation_id, user_id, role, is_muted, joined_at, last_read_at, users(first_name, last_name, avatar_url)";

/**
 * The screens of several conversations at once, in one round of queries, as
 * load-thread.ts makes for one. A conversation this person is not a member
 * of, or that is gone, is simply not in the answer. Null with no line.
 */
export async function fetchThreads(base: ThreadBase, ids: string[], labels: ThreadLabels): Promise<ThreadProps[] | null> {
  if (ids.length === 0) return [];
  const supabase = getBrowserClient();
  try {
    const [conversations, withMarks, pins, blocks] = await Promise.all([
      supabase.from("conversations").select("id, type, name, is_active, created_by").in("id", ids),
      supabase
        .from("conversation_members")
        .select(`${MEMBER_COLUMNS}, last_delivered_at, cleared_at`)
        .in("conversation_id", ids)
        .order("joined_at"),
      supabase
        .from("messages")
        .select("id, content, sender_id, created_at, conversation_id")
        .in("conversation_id", ids)
        .eq("is_pinned", true)
        .eq("is_deleted", false)
        .order("created_at")
        .limit(400),
      supabase.from("user_blocks").select("blocked_id").eq("blocker_id", base.currentUserId),
    ]);
    if (conversations.error || !conversations.data) return null;
    // A database from before 00094/00098 has neither column: the members without them.
    let memberRows = withMarks.error ? null : (withMarks.data as unknown as MemberRow[]);
    if (!memberRows) {
      const plain = await supabase.from("conversation_members").select(MEMBER_COLUMNS).in("conversation_id", ids).order("joined_at");
      if (plain.error || !plain.data) return null;
      memberRows = plain.data as unknown as MemberRow[];
    }
    const byConversation = new Map<string, MemberRow[]>();
    for (const row of memberRows) byConversation.set(row.conversation_id, [...(byConversation.get(row.conversation_id) ?? []), row]);

    const others = new Set<string>();
    for (const conversation of conversations.data) {
      if (conversation.type !== "direct") continue;
      const other = byConversation.get(conversation.id)?.find((m) => m.user_id !== base.currentUserId);
      if (other) others.add(other.user_id);
    }
    const presence =
      others.size > 0 ? await supabase.from("user_presence").select("user_id, last_seen_at").in("user_id", [...others]) : null;
    const seenAt = new Map((presence && !presence.error ? presence.data ?? [] : []).map((row) => [row.user_id, row.last_seen_at as string | null]));
    const blocked = (blocks.error ? [] : blocks.data ?? []).map((b) => b.blocked_id);

    const result: ThreadProps[] = [];
    for (const conversation of conversations.data) {
      if (!conversation.is_active) continue;
      const rows = byConversation.get(conversation.id) ?? [];
      const me = rows.find((m) => m.user_id === base.currentUserId);
      if (!me) continue;
      const members: ConversationMember[] = rows.map((row) => ({
        user_id: row.user_id,
        role: row.role === "admin" ? "admin" : "member",
        first_name: row.users?.first_name ?? null,
        last_name: row.users?.last_name ?? null,
        avatar_url: row.users?.avatar_url ?? null,
        last_read_at: row.last_read_at,
        last_delivered_at: row.last_delivered_at ?? null,
      }));
      const memberById = new Map(members.map((m) => [m.user_id, m]));
      const myRole = me.role === "admin" ? "admin" : "member";
      const isSupport = conversation.type === "support";
      const askedByMe = isSupport && conversation.created_by === base.currentUserId;
      const other = conversation.type === "direct" ? members.find((m) => m.user_id !== base.currentUserId) : undefined;
      result.push({
        conversation: {
          id: conversation.id,
          type: conversation.type,
          title: askedByMe
            ? labels.supportTitle
            : conversationTitle({ type: conversation.type, name: conversation.name, members }, base.currentUserId, labels.unknownUser),
          isMuted: me.is_muted,
          createdBy: conversation.created_by,
          subtitle: isSupport ? (askedByMe ? labels.supportSubtitle : labels.supportDeskSubtitle) : undefined,
          lastSeenAt: other ? seenAt.get(other.user_id) ?? null : null,
        },
        members,
        myRole,
        currentUserId: base.currentUserId,
        clearedAt: me.cleared_at ?? null,
        initialPinned: (pins.error ? [] : pins.data ?? [])
          .filter((p) => p.conversation_id === conversation.id)
          .slice(0, 20)
          .map((p) => ({
            id: p.id,
            content: p.content,
            sender_first_name: p.sender_id ? memberById.get(p.sender_id)?.first_name ?? null : null,
            sender_last_name: p.sender_id ? memberById.get(p.sender_id)?.last_name ?? null : null,
          })),
        blockedUserIds: blocked,
        canPost: isSupport || (base.canMessage && (!isBroadcast(conversation.type) || myRole === "admin")),
        canManageMembers: conversation.type === "group",
        canMessage: base.canMessage,
        timeZone: base.timeZone,
        schoolId: base.schoolId,
      });
    }
    for (const props of result) rememberThread(props);
    return result;
  } catch {
    return null;
  }
}

/** The newest of a conversation, as the thread's own first page asks for it. */
const PAGE = 50;

/**
 * The newest messages of conversations whose newest message this device does
 * not have yet, fetched ahead and kept (local-store.ts) — so a conversation
 * opens with them, line or no line, as in a messenger. Only reads: nothing is
 * marked as received or read by it (get_conversation_messages changes nothing).
 * Two at a time, so the list on a slow line is not held up.
 */
export async function fetchNewest(userId: string, wanted: Array<{ id: string; newestAt: string | null }>): Promise<void> {
  const supabase = getBrowserClient();
  const queue = [...wanted];
  const worker = async () => {
    while (queue.length > 0) {
      const next = queue.shift()!;
      const { messages } = await keptMessages(userId, next.id, 1);
      const newestHere = messages.length > 0 ? Date.parse(messages[messages.length - 1]!.created_at) : 0;
      if (next.newestAt && newestHere >= Date.parse(next.newestAt)) continue;
      if (!next.newestAt && messages.length > 0) continue;
      try {
        const { data, error } = await supabase.rpc("get_conversation_messages", { p_conversation_id: next.id, p_limit: PAGE });
        if (error || !Array.isArray(data)) return; // No line: the rest wait for the next time.
        const rows = data as unknown as ThreadMessage[];
        if (rows.length === 0) continue;
        const times = rows.map((m) => Date.parse(m.created_at)).filter(Number.isFinite);
        // A page that is not full is the start of the conversation: nothing before it is missing.
        const from = rows.length < PAGE ? 0 : Math.min(...times);
        await keepRun(userId, next.id, rows, from, Math.max(...times));
      } catch {
        return;
      }
    }
  };
  await Promise.all([worker(), worker()]);
}
