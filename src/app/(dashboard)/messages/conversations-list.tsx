"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageSquare } from "lucide-react";
import Link from "next/link";

interface ConversationMember {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: string;
}

export interface ConversationItem {
  id: string;
  type: string;
  name: string | null;
  avatarUrl: string | null;
  classId: string | null;
  isActive: boolean;
  updatedAt: string;
  lastMessage: {
    content: string;
    senderId: string;
    createdAt: string;
    type: string;
  } | null;
  unreadCount: number;
  members: ConversationMember[];
}

function getConversationName(
  conv: ConversationItem,
  currentUserId: string
): string {
  if (conv.name) return conv.name;
  if (conv.type === "direct") {
    const other = conv.members.find((m) => m.userId !== currentUserId);
    return other ? `${other.firstName} ${other.lastName}` : "...";
  }
  return conv.members.map((m) => m.firstName).join(", ");
}

function getConversationInitials(
  conv: ConversationItem,
  currentUserId: string
): string {
  if (conv.name) return conv.name.slice(0, 2);
  if (conv.type === "direct") {
    const other = conv.members.find((m) => m.userId !== currentUserId);
    return other
      ? `${other.firstName.charAt(0)}${other.lastName.charAt(0)}`
      : "..";
  }
  return conv.members
    .slice(0, 2)
    .map((m) => m.firstName.charAt(0))
    .join("");
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (diffDays === 1) return "Дирӯз";
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function ConversationsList({
  conversations,
  currentUserId,
  activeConversationId,
}: {
  conversations: ConversationItem[];
  currentUserId: string;
  activeConversationId?: string;
}) {
  const t = useTranslations("messages");

  if (conversations.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<MessageSquare className="h-12 w-12" />}
          title={t("noConversations")}
          description={t("noConversationsDesc")}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {conversations.map((conv) => {
        const name = getConversationName(conv, currentUserId);
        const initials = getConversationInitials(conv, currentUserId);
        const isActive = conv.id === activeConversationId;

        return (
          <Link
            key={conv.id}
            href={`/messages/${conv.id}`}
            className={cn(
              "flex items-center gap-3 border-b border-neutral-100 px-4 py-3 transition-colors duration-[var(--duration-fast)]",
              isActive
                ? "border-l-2 border-l-primary-500 bg-primary-50"
                : "hover:bg-neutral-50"
            )}
          >
            <Avatar fallback={initials} />

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "truncate text-sm",
                    conv.unreadCount > 0
                      ? "font-semibold text-neutral-900"
                      : "font-medium text-neutral-700"
                  )}
                >
                  {name}
                </span>
                {conv.lastMessage && (
                  <span className="shrink-0 text-xs text-neutral-400">
                    {formatTime(conv.lastMessage.createdAt)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <p
                  className={cn(
                    "truncate text-xs",
                    conv.unreadCount > 0
                      ? "font-medium text-neutral-600"
                      : "text-neutral-400"
                  )}
                >
                  {conv.lastMessage?.content || t("noMessages")}
                </p>
                {conv.unreadCount > 0 && (
                  <Badge className="ml-2 h-5 min-w-[20px] shrink-0 rounded-full bg-primary-500 px-1.5 text-[10px] text-white">
                    {conv.unreadCount}
                  </Badge>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
