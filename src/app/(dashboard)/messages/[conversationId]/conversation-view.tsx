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

function getTypeIcon(type: string) {
  switch (type) {
    case "direct":
      return User;
    case "group":
      return Users;
    case "announcement":
      return Megaphone;
    case "class_group":
      return Users;
    default:
      return MessageSquare;
  }
}

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

  const Icon = getTypeIcon(conversationType);

  return (
    <div className="flex h-[calc(100vh-4rem-5rem)] overflow-hidden rounded-xl border border-neutral-200 bg-white lg:h-[calc(100vh-4rem)]">
      {/* Sidebar: conversation list (hidden on mobile) */}
      <div className="hidden w-80 flex-col border-r border-neutral-200 lg:flex xl:w-96">
        <ConversationsList
          conversations={conversations}
          currentUserId={currentUserId}
          activeConversationId={conversationId}
        />
      </div>

      {/* Main: message thread */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3">
          <Link href="/messages" className="lg:hidden">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <Icon className="h-5 w-5 text-neutral-400" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-neutral-900">
              {conversationName}
            </h2>
            <p className="text-xs text-neutral-400">
              {members.length} {t("members")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowInfo(!showInfo)}
          >
            <Info className="h-5 w-5" />
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
