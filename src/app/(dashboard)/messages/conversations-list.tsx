"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageSquare, Search, Plus } from "lucide-react";
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

function formatTime(dateStr: string, yesterday: string): string {
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
  if (diffDays === 1) return yesterday;
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function ConversationsList({
  conversations: initialConversations,
  currentUserId,
  activeConversationId,
}: {
  conversations: ConversationItem[];
  currentUserId: string;
  activeConversationId?: string;
}) {
  const t = useTranslations("messages");
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState(initialConversations);

  // Sync with server-refreshed data (revalidatePath)
  useEffect(() => {
    setConversations(initialConversations);
  }, [initialConversations]);

  // Real-time: update list when new messages arrive
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("conv-list-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Record<string, unknown>;
          const convId = msg.conversation_id as string;
          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.id === convId);
            if (idx === -1) return prev;
            const updated = [...prev];
            const conv = { ...updated[idx] };
            conv.lastMessage = {
              content: msg.content as string,
              senderId: msg.sender_id as string,
              createdAt: msg.created_at as string,
              type: msg.type as string,
            };
            if (convId !== activeConversationId && msg.sender_id !== currentUserId) {
              conv.unreadCount = (conv.unreadCount ?? 0) + 1;
            }
            updated[idx] = conv;
            updated.sort((a, b) => {
              const aTime = a.lastMessage?.createdAt ?? a.updatedAt;
              const bTime = b.lastMessage?.createdAt ?? b.updatedAt;
              return new Date(bTime).getTime() - new Date(aTime).getTime();
            });
            return updated;
          });
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [currentUserId, activeConversationId]);

  const filtered = search.trim()
    ? conversations.filter((conv) => {
        const name = getConversationName(conv, currentUserId).toLowerCase();
        const q = search.toLowerCase();
        return (
          name.includes(q) ||
          conv.lastMessage?.content.toLowerCase().includes(q)
        );
      })
    : conversations;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-200/70 bg-white px-4 py-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">
            {t("title")}
          </h2>
          <Link href="/messages/new">
            <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full">
              <Plus className="h-5 w-5" />
            </Button>
          </Link>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchConversations")}
            className="w-full rounded-full border border-neutral-200 bg-white py-2 pl-9 pr-4 text-sm outline-none transition-colors duration-150 placeholder:text-neutral-400 focus:border-primary-300 focus:ring-1 focus:ring-primary-200"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<MessageSquare className="h-12 w-12" />}
              title={search ? t("noResults") : t("noConversations")}
              description={search ? "" : t("noConversationsDesc")}
            />
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((conv) => {
              const name = getConversationName(conv, currentUserId);
              const initials = getConversationInitials(conv, currentUserId);
              const isActive = conv.id === activeConversationId;

              return (
                <Link
                  key={conv.id}
                  href={`/messages/${conv.id}`}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 transition-colors duration-150",
                    isActive
                      ? "bg-primary-50"
                      : "hover:bg-neutral-50"
                  )}
                >
                  <div className="relative shrink-0">
                    <Avatar fallback={initials} />
                    {conv.type === "group" && (
                      <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-200 text-[8px] font-medium text-neutral-600">
                        {conv.members.length}
                      </div>
                    )}
                  </div>

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
                        <span className={cn(
                          "shrink-0 text-[11px]",
                          conv.unreadCount > 0 ? "font-medium text-primary-500" : "text-neutral-400"
                        )}>
                          {formatTime(conv.lastMessage.createdAt, t("yesterday"))}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={cn(
                          "truncate text-[13px]",
                          conv.unreadCount > 0
                            ? "font-medium text-neutral-600"
                            : "text-neutral-400"
                        )}
                      >
                        {conv.lastMessage?.content || t("noMessages")}
                      </p>
                      {conv.unreadCount > 0 && (
                        <Badge className="h-5 min-w-[20px] shrink-0 rounded-full bg-primary-500 px-1.5 text-[10px] font-semibold text-white">
                          {conv.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
