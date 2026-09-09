"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Pin, Reply, Trash2, Copy, Clock } from "lucide-react";
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
  isOptimistic?: boolean;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// WhatsApp-style status icon
function MessageStatus({ isOptimistic, isRead }: { isOptimistic: boolean; isRead: boolean }) {
  if (isOptimistic) {
    return <Clock className="h-2.5 w-2.5 opacity-60" />;
  }
  if (isRead) {
    // Double overlapping checks (blue)
    return (
      <span className="relative inline-flex" style={{ width: 14, height: 10 }}>
        <svg viewBox="0 0 16 11" fill="none" width="16" height="11" style={{ position: "absolute", left: 0, top: 0 }}>
          <path d="M1 5.5L5 9.5L11 1.5" stroke="#53bdeb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M5 9.5L15 1.5" stroke="#53bdeb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
    );
  }
  // Single check (gray/white) — sent
  return (
    <span className="relative inline-flex" style={{ width: 10, height: 10 }}>
      <svg viewBox="0 0 12 11" fill="none" width="12" height="11" style={{ position: "absolute", left: 0, top: 0 }}>
        <path d="M1 5.5L5 9.5L11 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </span>
  );
}

interface ContextMenuState {
  messageId: string;
  isOwn: boolean;
  canManage: boolean;
  content: string;
  isPinned: boolean;
  x: number;
  y: number;
}

function MessageBubble({
  message,
  isOwn,
  canManage,
  onReply,
  allMessages,
  onContextMenu,
  otherMembersLastRead,
}: {
  message: MessageItem;
  isOwn: boolean;
  canManage: boolean;
  onReply: (id: string) => void;
  allMessages: MessageItem[];
  onContextMenu: (e: React.MouseEvent | React.TouchEvent, msg: MessageItem, isOwn: boolean) => void;
  otherMembersLastRead: string | null;
}) {
  const t = useTranslations("messages");
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const replyTarget = message.replyToId
    ? allMessages.find((m) => m.id === message.replyToId)
    : null;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    longPressTimer.current = setTimeout(() => {
      onContextMenu(e, message, isOwn);
    }, 500);
  }, [message, isOwn, onContextMenu]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, message, isOwn);
  }, [message, isOwn, onContextMenu]);

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
      <div className="py-1 text-center">
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-[11px] text-neutral-400">{message.content}</span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-end gap-2", isOwn ? "flex-row-reverse" : "flex-row")}>
      {!isOwn && (
        <Avatar fallback={message.senderName.slice(0, 2)} src={message.senderAvatar} size="sm" className="mb-1 shrink-0" />
      )}

      <div className={cn("max-w-[78%] sm:max-w-[65%]", isOwn ? "items-end" : "items-start", "flex flex-col")}>
        {!isOwn && (
          <span className="mb-0.5 ml-1 text-[11px] font-semibold text-indigo-500">
            {message.senderName}
          </span>
        )}

        {replyTarget && (
          <div className={cn(
            "mb-1 max-w-full rounded-xl border-l-[3px] px-2.5 py-1.5 text-xs",
            isOwn
              ? "border-white/60 bg-indigo-400/30 text-white/80"
              : "border-indigo-400 bg-indigo-50 text-neutral-500"
          )}>
            <span className="block font-semibold">{replyTarget.senderName}</span>
            <span className="line-clamp-1">{replyTarget.content}</span>
          </div>
        )}

        <div
          onContextMenu={handleContextMenu}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchEnd}
          className={cn(
            "relative cursor-pointer select-none rounded-[18px] px-3.5 py-2 text-sm leading-relaxed active:opacity-80",
            isOwn
              ? "rounded-br-[4px] text-white"
              : "rounded-bl-[4px] bg-neutral-100 text-neutral-800"
          )}
          style={isOwn ? { background: "linear-gradient(135deg, #818cf8 0%, #4f46e5 100%)" } : {}}
        >
          {/* Message text + time trick (float right spacer) */}
          <span className="break-words">
            {message.content}
            {/* Invisible spacer so time doesn't overlap text */}
            <span className="ml-10 inline-block" aria-hidden />
          </span>

          {/* Time + status inside bubble, bottom-right */}
          <span className={cn(
            "absolute bottom-1.5 right-2.5 flex items-center gap-1 text-[10px] leading-none select-none",
            isOwn ? "text-white/70" : "text-neutral-400"
          )}>
            {message.isEdited && <span className="italic">{t("edited")}</span>}
            {message.isPinned && <Pin className="h-2.5 w-2.5" />}
            {formatTime(message.createdAt)}
            {isOwn && (
              <MessageStatus
                isOptimistic={!!message.isOptimistic}
                isRead={!message.isOptimistic && !!otherMembersLastRead && otherMembersLastRead >= message.createdAt}
              />
            )}
          </span>
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
  otherMembersLastRead,
}: {
  messages: MessageItem[];
  currentUserId: string;
  canManage: boolean;
  onReply: (id: string) => void;
  onEdit: (id: string) => void;
  otherMembersLastRead?: string | null;
}) {
  const t = useTranslations("messages");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [contextMenu]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent | React.TouchEvent, msg: MessageItem, isOwn: boolean) => {
      if ("preventDefault" in e && (e as React.MouseEvent).preventDefault) {
        (e as React.MouseEvent).preventDefault();
      }
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setContextMenu({
        messageId: msg.id,
        isOwn,
        canManage,
        content: msg.content,
        isPinned: msg.isPinned,
        x: rect.left,
        y: rect.top,
      });
    },
    [canManage]
  );

  const closeMenu = () => setContextMenu(null);

  return (
    <div ref={scrollRef} className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4">
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          isOwn={msg.senderId === currentUserId}
          canManage={canManage}
          onReply={onReply}
          allMessages={messages}
          onContextMenu={handleContextMenu}
          otherMembersLastRead={otherMembersLastRead ?? null}
        />
      ))}

      {/* Context menu overlay */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px]" onClick={closeMenu} />
          <div
            ref={menuRef}
            className="fixed z-50 min-w-[200px] overflow-hidden rounded-2xl bg-white shadow-[0_8px_40px_rgba(0,0,0,0.18)] border border-neutral-100"
            style={{
              top: Math.min(contextMenu.y, window.innerHeight - 280),
              left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 216)),
            }}
          >
            {[
              {
                icon: Reply, label: t("reply"), action: () => { onReply(contextMenu.messageId); closeMenu(); }
              },
              {
                icon: Copy, label: t("copy") || "Копировать", action: () => {
                  navigator.clipboard?.writeText(contextMenu.content).catch(() => {});
                  closeMenu();
                }
              },
              ...(contextMenu.canManage ? [{
                icon: Pin, label: contextMenu.isPinned ? t("unpin") : t("pin"), action: () => {
                  void pinMessageAction(contextMenu.messageId, !contextMenu.isPinned);
                  closeMenu();
                }
              }] : []),
              ...(contextMenu.isOwn ? [{
                icon: Trash2,
                label: t("delete"),
                danger: true,
                action: () => {
                  void deleteMessageAction(contextMenu.messageId);
                  closeMenu();
                }
              }] : []),
            ].map((item, i) => (
              <button
                key={i}
                onClick={item.action}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-neutral-50 active:bg-neutral-100",
                  (item as { danger?: boolean }).danger ? "text-red-500" : "text-neutral-800",
                  i > 0 && "border-t border-neutral-100"
                )}
              >
                <item.icon className={cn("h-4 w-4", (item as { danger?: boolean }).danger ? "text-red-400" : "text-neutral-400")} />
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
