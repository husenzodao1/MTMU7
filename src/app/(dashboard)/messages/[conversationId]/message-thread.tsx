"use client";

import { useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Pin, Reply, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteMessageAction, pinMessageAction } from "./actions";

export interface MessageItem {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderName: string;
  senderAvatar: string | null;
  content: string;
  type: string;
  replyToId: string | null;
  isPinned: boolean;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
}

function formatMessageTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MessageBubble({
  message,
  isOwn,
  canManage,
  onReply,
  onEdit,
  allMessages,
}: {
  message: MessageItem;
  isOwn: boolean;
  canManage: boolean;
  onReply: (id: string) => void;
  onEdit: (id: string) => void;
  allMessages: MessageItem[];
}) {
  const t = useTranslations("messages");

  const replyTarget = message.replyToId
    ? allMessages.find((m) => m.id === message.replyToId)
    : null;

  if (message.isDeleted) {
    return (
      <div className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
        <div className="rounded-2xl bg-neutral-100 px-4 py-2 text-sm italic text-neutral-400">
          {t("messageDeleted")}
        </div>
      </div>
    );
  }

  if (message.type === "system") {
    return (
      <div className="py-2 text-center text-xs text-neutral-400">
        {message.content}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex gap-2",
        isOwn ? "flex-row-reverse" : "flex-row"
      )}
    >
      {!isOwn && (
        <Avatar
          fallback={message.senderName.slice(0, 2)}
          src={message.senderAvatar}
          size="sm"
          className="mt-1"
        />
      )}
      <div className={cn("max-w-[75%]", isOwn ? "items-end" : "items-start")}>
        {!isOwn && (
          <span className="mb-0.5 block text-xs font-medium text-neutral-500">
            {message.senderName}
          </span>
        )}
        {replyTarget && (
          <div className="mb-1 rounded-lg border-l-2 border-primary-300 bg-primary-50 px-3 py-1 text-xs text-neutral-500">
            <span className="font-medium">{replyTarget.senderName}:</span>{" "}
            {replyTarget.content.slice(0, 80)}
          </div>
        )}
        <div
          className={cn(
            "rounded-2xl px-4 py-2 text-sm transition-shadow duration-[var(--duration-fast)]",
            isOwn
              ? "bg-primary-500 text-white"
              : "bg-neutral-100 text-neutral-800"
          )}
        >
          {message.content}
        </div>
        <div
          className={cn(
            "mt-0.5 flex items-center gap-1 text-[10px] text-neutral-400",
            isOwn ? "justify-end" : "justify-start"
          )}
        >
          {formatMessageTime(message.createdAt)}
          {message.isEdited && <span>· {t("edited")}</span>}
          {message.isPinned && <Pin className="h-3 w-3" />}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="ml-1 rounded p-0.5 opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100"
              >
                <MoreHorizontal className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isOwn ? "end" : "start"}>
              <DropdownMenuItem onClick={() => onReply(message.id)}>
                <Reply className="mr-2 h-3 w-3" />
                {t("reply")}
              </DropdownMenuItem>
              {isOwn && !message.isDeleted && (
                <>
                  <DropdownMenuItem onClick={() => onEdit(message.id)}>
                    <Pencil className="mr-2 h-3 w-3" />
                    {t("edit")}
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <form action={deleteMessageAction.bind(null, message.id)}>
                      <button type="submit" className="flex w-full items-center text-red-500">
                        <Trash2 className="mr-2 h-3 w-3" />
                        {t("delete")}
                      </button>
                    </form>
                  </DropdownMenuItem>
                </>
              )}
              {canManage && (
                <DropdownMenuItem asChild>
                  <form
                    action={pinMessageAction.bind(
                      null,
                      message.id,
                      !message.isPinned
                    )}
                  >
                    <button type="submit" className="flex w-full items-center">
                      <Pin className="mr-2 h-3 w-3" />
                      {message.isPinned ? t("unpin") : t("pin")}
                    </button>
                  </form>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

export function MessageThread({
  messages,
  currentUserId,
  canManage,
  onReply,
  onEdit,
}: {
  messages: MessageItem[];
  currentUserId: string;
  canManage: boolean;
  onReply: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
    >
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          isOwn={msg.senderId === currentUserId}
          canManage={canManage}
          onReply={onReply}
          onEdit={onEdit}
          allMessages={messages}
        />
      ))}
    </div>
  );
}
