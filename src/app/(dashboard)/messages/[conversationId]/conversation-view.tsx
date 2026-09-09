"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { MessageThread, type MessageItem } from "./message-thread";
import { MessageInput } from "./message-input";
import { ConversationsList, type ConversationItem } from "../conversations-list";
import { ConversationInfo } from "./conversation-info";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, Megaphone, User, MessageSquare, Info } from "lucide-react";
import Link from "next/link";

interface Member {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: string;
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
  messages,
  conversationName,
  conversationType,
  members,
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const replyToMessage = replyToId
    ? messages.find((m) => m.id === replyToId)
    : null;

  const handleReply = useCallback((id: string) => {
    setReplyToId(id);
    setEditingId(null);
  }, []);

  const handleEdit = useCallback((id: string) => {
    setEditingId(id);
    setReplyToId(null);
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyToId(null);
  }, []);

  void editingId;

  const IconComponent = typeIconMap[conversationType] || MessageSquare;

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
      <div className="flex flex-1 flex-col bg-white">
        <div className="flex h-16 items-center gap-3 border-b border-neutral-200/70 px-5 bg-white/80 backdrop-blur-sm">
          <Link href="/messages" className="lg:hidden">
            <Button variant="ghost" size="icon-sm">
              <ArrowLeft className="h-4.5 w-4.5 text-neutral-700" />
            </Button>
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EEF2F8] text-neutral-800 shadow-2xs">
            <IconComponent className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold text-neutral-900 tracking-tight">
              {conversationName}
            </h2>
            <p className="text-[11px] font-medium text-neutral-400">
              {members.length} {t("members")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowInfo(!showInfo)}
            aria-label="Conversation Info"
          >
            <Info className="h-4.5 w-4.5 text-neutral-600" />
          </Button>
        </div>

        <MessageThread
          messages={messages}
          currentUserId={currentUserId}
          canManage={canManage}
          onReply={handleReply}
          onEdit={handleEdit}
        />

        <MessageInput
          conversationId={conversationId}
          replyToId={replyToId}
          replyToContent={replyToMessage?.content ?? null}
          onCancelReply={handleCancelReply}
        />
      </div>

      {/* Info panel */}
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
