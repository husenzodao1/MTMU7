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

// WhatsApp-style status icon — explicit colors, always visible on indigo bubble
function MessageStatus({ isOptimistic, isRead }: { isOptimistic: boolean; isRead: boolean }) {
  if (isOptimistic) {
    return <Clock className="h-3 w-3 shrink-0" style={{ color: "rgba(255,255,255,0.85)" }} />;
  }
  if (isRead) {
    // Double overlapping checks — blue (WhatsApp style)
    return (
      <svg width="18" height="11" viewBox="0 0 18 11" fill="none" className="shrink-0">
        <path d="M1 5.5L5 9.5L11 1.5" stroke="#7dd3fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M7 9.5L17 1.5" stroke="#7dd3fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  // Single white check — sent & delivered
  return (
    <svg width="12" height="11" viewBox="0 0 12 11" fill="none" className="shrink-0">
      <path d="M1 5.5L5 9.5L11 1.5" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

interface ContextMenuState {
  messageId: string;
  isOwn: boolean;
  canManage: boolean;
  content: string;
  isPinned: boolean;
  // bubble rect (viewport-relative) for positioning the action bar above the bubble
  bubbleLeft: number;
  bubbleTop: number;
  bubbleRight: number;
  bubbleWidth: number;
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
  onContextMenu: (e: React.MouseEvent | React.TouchEvent, msg: MessageItem, isOwn: boolean, rect: DOMRect) => void;
  otherMembersLastRead: string | null;
}) {
  const t = useTranslations("messages");
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const replyTarget = message.replyToId
    ? allMessages.find((m) => m.id === message.replyToId)
    : null;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.persist?.();
    const el = bubbleRef.current;
    longPressTimer.current = setTimeout(() => {
      if (!el) return;
      onContextMenu(e, message, isOwn, el.getBoundingClientRect());
    }, 500);
  }, [message, isOwn, onContextMenu]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const el = bubbleRef.current;
    if (!el) return;
    onContextMenu(e, message, isOwn, el.getBoundingClientRect());
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
          ref={bubbleRef}
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
            {/* Invisible spacer: wider for own messages (time + status icon) */}
            <span className={cn("inline-block align-middle", isOwn ? "ml-16" : "ml-10")} aria-hidden />
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
    (e: React.MouseEvent | React.TouchEvent, msg: MessageItem, isOwn: boolean, rect: DOMRect) => {
      if ("preventDefault" in e && (e as React.MouseEvent).preventDefault) {
        (e as React.MouseEvent).preventDefault();
      }
      setContextMenu({
        messageId: msg.id,
        isOwn,
        canManage,
        content: msg.content,
        isPinned: msg.isPinned,
        bubbleLeft: rect.left,
        bubbleTop: rect.top,
        bubbleRight: rect.right,
        bubbleWidth: rect.width,
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

      {/* WhatsApp-style floating action bar above the bubble */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeMenu} />
          <div
            ref={menuRef}
            className="fixed z-50 flex items-center gap-1 rounded-full bg-white shadow-[0_4px_24px_rgba(0,0,0,0.18)] border border-neutral-100 px-2 py-1.5"
            style={(() => {
              const BAR_HEIGHT = 48;
              const BAR_WIDTH = (1 + 1 + (contextMenu.canManage ? 1 : 0) + (contextMenu.isOwn ? 1 : 0)) * 44;
              const GAP = 8;
              // Position above the bubble, centered horizontally over it
              const top = Math.max(GAP, contextMenu.bubbleTop - BAR_HEIGHT - GAP);
              // Center over bubble, but clamp to screen
              const center = contextMenu.bubbleLeft + contextMenu.bubbleWidth / 2;
              const left = Math.max(GAP, Math.min(center - BAR_WIDTH / 2, window.innerWidth - BAR_WIDTH - GAP));
              return { top, left };
            })()}
          >
            <button
              onClick={() => { onReply(contextMenu.messageId); closeMenu(); }}
              className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-neutral-100 active:bg-neutral-200"
              title={t("reply")}
            >
              <Reply className="h-4 w-4 text-neutral-600" />
            </button>
            <button
              onClick={() => { navigator.clipboard?.writeText(contextMenu.content).catch(() => {}); closeMenu(); }}
              className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-neutral-100 active:bg-neutral-200"
              title={t("copy") || "Copy"}
            >
              <Copy className="h-4 w-4 text-neutral-600" />
            </button>
            {contextMenu.canManage && (
              <button
                onClick={() => { void pinMessageAction(contextMenu.messageId, !contextMenu.isPinned); closeMenu(); }}
                className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-neutral-100 active:bg-neutral-200"
                title={contextMenu.isPinned ? t("unpin") : t("pin")}
              >
                <Pin className={cn("h-4 w-4", contextMenu.isPinned ? "text-indigo-500" : "text-neutral-600")} />
              </button>
            )}
            {contextMenu.isOwn && (
              <button
                onClick={() => { void deleteMessageAction(contextMenu.messageId); closeMenu(); }}
                className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-red-50 active:bg-red-100"
                title={t("delete")}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
