"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { MessageThread, type MessageItem } from "./message-thread";
import { MessageInput } from "./message-input";
import { ConversationsList, type ConversationItem } from "../conversations-list";
import { ConversationInfo } from "./conversation-info";
import { useRealtimeMessages } from "./use-realtime-messages";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, Megaphone, User, MessageSquare, Info } from "lucide-react";
import Link from "next/link";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface Member {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: string;
  lastReadAt?: string | null;
}

const typeIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  direct: User,
  group: Users,
  announcement: Megaphone,
  class_group: Users,
};

export function ConversationView({
  conversationId,
  currentUserId,
  messages: initialMessages,
  conversationName,
  conversationType,
  members: initialMembers,
  conversations,
  canManage,
}: {
  conversationId: string;
  currentUserId: string;
  messages: MessageItem[];
  conversationName: string;
  conversationType: string;
  members: Member[];
  conversations: ConversationItem[];
  canManage: boolean;
}) {
  const t = useTranslations("messages");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  // Mutable members state — updated via realtime when other users read messages
  const [prevConvId, setPrevConvId] = useState(conversationId);
  const [members, setMembers] = useState(initialMembers);

  // Reset members state when navigating to a different conversation
  if (prevConvId !== conversationId) {
    setPrevConvId(conversationId);
    setMembers(initialMembers);
  }

  // Realtime: update otherMembersLastRead when any member's last_read_at changes
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`conv-members:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation_members" },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const updated = payload.new as Record<string, unknown>;
          if (!updated.conversation_id || updated.conversation_id !== conversationId) return;
          // Skip own updates (we already know our own read status)
          if (updated.user_id === currentUserId) return;

          setMembers((prev) =>
            prev.map((m) =>
              m.userId === (updated.user_id as string)
                ? { ...m, lastReadAt: updated.last_read_at as string | null }
                : m
            )
          );
        }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [conversationId, currentUserId]);

  // Max lastReadAt of all OTHER members — drives read receipt display (blue double-checks)
  const otherMembersLastRead =
    members
      .filter((m) => m.userId !== currentUserId && m.lastReadAt)
      .map((m) => m.lastReadAt as string)
      .sort()
      .at(-1) ?? null;

  const { messages, addOptimisticMessage } = useRealtimeMessages(
    conversationId,
    initialMessages,
    currentUserId
  );

  const replyToMessage = replyToId ? messages.find((m) => m.id === replyToId) : null;

  const handleReply = useCallback((id: string) => { setReplyToId(id); }, []);
  const handleCancelReply = useCallback(() => { setReplyToId(null); }, []);

  const IconComponent = typeIconMap[conversationType] ?? MessageSquare;

  return (
    <div className="flex h-[calc(100vh-6rem-5rem)] overflow-hidden rounded-[26px] border border-neutral-200/70 bg-white/95 shadow-card backdrop-blur-md lg:h-[calc(100vh-7.5rem)]">
      {/* Sidebar: conversation list (hidden on mobile) */}
      <div className="hidden w-80 flex-col border-r border-neutral-200/70 bg-[#F8FAFD]/60 lg:flex xl:w-96">
        <ConversationsList
          conversations={conversations}
          currentUserId={currentUserId}
          activeConversationId={conversationId}
        />
      </div>

      {/* Main: message thread */}
      <div className="flex flex-1 flex-col bg-white min-w-0">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-neutral-100 px-4 bg-white">
          <Link href="/messages" className="lg:hidden">
            <Button variant="ghost" size="icon-sm">
              <ArrowLeft className="h-4 w-4 text-neutral-600" />
            </Button>
          </Link>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 text-indigo-700">
            <IconComponent className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold text-neutral-900">{conversationName}</h2>
            <p className="text-[11px] text-neutral-400">{members.length} {t("members")}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => setShowInfo(!showInfo)}>
            <Info className="h-4 w-4 text-neutral-500" />
          </Button>
        </div>

        <MessageThread
          messages={messages}
          currentUserId={currentUserId}
          canManage={canManage}
          onReply={handleReply}
          onEdit={() => {}}
          otherMembersLastRead={otherMembersLastRead}
        />

        <MessageInput
          conversationId={conversationId}
          replyToId={replyToId}
          replyToContent={replyToMessage?.content ?? null}
          onCancelReply={handleCancelReply}
          onOptimisticSend={addOptimisticMessage}
        />
      </div>

      {showInfo && (
        <ConversationInfo
          conversationId={conversationId}
          conversationName={conversationName}
          conversationType={conversationType}
          members={members}
          canManage={canManage}
          onClose={() => setShowInfo(false)}
        />
      )}
    </div>
  );
}
