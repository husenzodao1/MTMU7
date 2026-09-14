"use client";

import {
  ArrowLeft,
  Ban,
  Bell,
  BellOff,
  Copy,
  CornerUpLeft,
  EllipsisVertical,
  Flag,
  LogOut,
  Pencil,
  Pin,
  PinOff,
  SendHorizontal,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/form-controls";
import { Avatar } from "@/components/ui/misc";
import * as Overlay from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import {
  deleteMessageAction,
  editMessageAction,
  fetchMessageAction,
  loadOlderMessagesAction,
  markConversationReadAction,
  removeGroupMemberAction,
  reportMessageAction,
  sendMessageAction,
  setBlockedAction,
  setMessagePinnedAction,
  setMutedAction,
  toggleMessageFavoriteAction,
} from "@/features/messages/actions";
import { GroupMembersDialog } from "@/features/messages/group-members";
import { EDIT_WINDOW_MS, MESSAGE_MAX_LENGTH, REPORT_REASONS, type ConversationMember, type ThreadMessage } from "@/features/messages/types";
import { dayKey, formatClock, formatDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { getBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils/cn";

export interface ThreadConversation {
  id: string;
  type: string;
  title: string;
  isMuted: boolean;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  content: string;
  type: string;
  reply_to_id: string | null;
  is_pinned: boolean;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  edited_at: string | null;
}

function sortAsc(list: ThreadMessage[]): ThreadMessage[] {
  return [...list].sort((a, b) => (a.created_at === b.created_at ? a.id.localeCompare(b.id) : a.created_at.localeCompare(b.created_at)));
}

export function Thread({
  conversation,
  members: initialMembers,
  myRole,
  currentUserId,
  initialMessages,
  initialPinned,
  blockedUserIds,
  canPost,
  canManageMembers,
  timeZone,
}: {
  conversation: ThreadConversation;
  members: ConversationMember[];
  myRole: "admin" | "member";
  currentUserId: string;
  initialMessages: ThreadMessage[];
  initialPinned: Array<Pick<ThreadMessage, "id" | "content" | "sender_first_name" | "sender_last_name">>;
  blockedUserIds: string[];
  canPost: boolean;
  canManageMembers: boolean;
  timeZone: string;
}) {
  const t = useTranslations("portal.messages");
  const tRoot = useTranslations();
  const locale = useLocale() as Locale;
  const toast = useToast();
  const router = useRouter();

  const [messages, setMessages] = useState<ThreadMessage[]>(() => sortAsc(initialMessages));
  const [hasMore, setHasMore] = useState(initialMessages.length >= 50);
  const [pinned, setPinned] = useState(initialPinned);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ThreadMessage | null>(null);
  const [editing, setEditing] = useState<ThreadMessage | null>(null);
  const [reporting, setReporting] = useState<ThreadMessage | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [sending, startSending] = useTransition();
  const [loadingOlder, startLoadingOlder] = useTransition();
  const [, startAction] = useTransition();

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const preserveScroll = useRef<number | null>(null);
  const stickToBottom = useRef(true);

  const members = initialMembers;
  const memberMap = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const other = conversation.type === "direct" ? members.find((m) => m.user_id !== currentUserId) : undefined;
  const iBlockedOther = Boolean(other && blockedUserIds.includes(other.user_id));
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  const fail = useCallback((key: string) => toast("danger", tRoot(key)), [toast, tRoot]);

  // Keep the view pinned to the newest message unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (preserveScroll.current !== null) {
      el.scrollTop = el.scrollHeight - preserveScroll.current;
      preserveScroll.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const upsert = useCallback((incoming: ThreadMessage) => {
    setMessages((current) => {
      const index = current.findIndex((m) => m.id === incoming.id);
      if (index === -1) return sortAsc([...current, incoming]);
      const next = [...current];
      next[index] = { ...current[index]!, ...incoming };
      return next;
    });
  }, []);

  // Realtime: RLS delivers only messages of conversations the user belongs to.
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`thread:${conversation.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` }, (payload) => {
        const row = payload.new as MessageRow;
        const sender = row.sender_id ? memberMap.get(row.sender_id) : undefined;
        if (row.sender_id && !sender) {
          void fetchMessageAction(conversation.id, row.id).then((result) => {
            if (result.ok && result.data) upsert(result.data);
          });
        } else {
          upsert({
            ...row,
            sender_first_name: sender?.first_name ?? null,
            sender_last_name: sender?.last_name ?? null,
            sender_avatar_url: sender?.avatar_url ?? null,
            is_favorite: false,
          });
        }
        if (row.sender_id !== currentUserId && document.visibilityState === "visible") {
          void markConversationReadAction(conversation.id);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` }, (payload) => {
        const row = payload.new as MessageRow;
        setMessages((current) =>
          current.map((m) =>
            m.id === row.id
              ? { ...m, content: row.is_deleted ? "" : row.content, is_edited: row.is_edited, is_deleted: row.is_deleted, is_pinned: row.is_pinned, edited_at: row.edited_at }
              : m
          )
        );
        setPinned((current) => {
          const without = current.filter((p) => p.id !== row.id);
          if (!row.is_pinned || row.is_deleted) return without;
          const sender = row.sender_id ? memberMap.get(row.sender_id) : undefined;
          return [...without, { id: row.id, content: row.content, sender_first_name: sender?.first_name ?? null, sender_last_name: sender?.last_name ?? null }];
        });
      })
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") void markConversationReadAction(conversation.id);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [conversation.id, currentUserId, memberMap, upsert]);

  const loadOlder = () => {
    const oldest = messages[0];
    if (!oldest) return;
    startLoadingOlder(async () => {
      const result = await loadOlderMessagesAction(conversation.id, oldest.created_at, oldest.id);
      if (!result.ok) return fail(result.message);
      const older = result.data ?? [];
      const el = scrollRef.current;
      if (el) preserveScroll.current = el.scrollHeight - el.scrollTop;
      setMessages((current) => sortAsc([...older.filter((m) => !current.some((c) => c.id === m.id)), ...current]));
      setHasMore(older.length >= 50);
    });
  };

  const submit = () => {
    const content = draft.trim();
    if (!content || sending) return;
    if (editing) {
      const target = editing;
      startSending(async () => {
        const result = await editMessageAction(target.id, content);
        if (!result.ok) return fail(result.message);
        upsert({ ...target, content, is_edited: true });
        setEditing(null);
        setDraft("");
      });
      return;
    }
    const reply = replyTo;
    startSending(async () => {
      const result = await sendMessageAction(conversation.id, content, reply?.id ?? null);
      if (!result.ok || !result.data) return fail(result.ok ? "errors.unexpected" : result.message);
      stickToBottom.current = true;
      const me = memberMap.get(currentUserId);
      upsert({
        id: result.data.id,
        conversation_id: conversation.id,
        sender_id: currentUserId,
        sender_first_name: me?.first_name ?? null,
        sender_last_name: me?.last_name ?? null,
        sender_avatar_url: me?.avatar_url ?? null,
        content,
        type: "text",
        reply_to_id: reply?.id ?? null,
        is_pinned: false,
        is_edited: false,
        is_deleted: false,
        is_favorite: false,
        created_at: byId.get(result.data.id)?.created_at ?? new Date().toISOString(),
        edited_at: null,
      });
      setDraft("");
      setReplyTo(null);
      inputRef.current?.focus();
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape" && (editing || replyTo)) {
      setEditing(null);
      setReplyTo(null);
      setDraft("");
    }
  };

  const runAction = (task: () => Promise<{ ok: boolean; message?: string }>, onSuccess?: () => void) => {
    startAction(async () => {
      const result = await task();
      if (!result.ok) return fail(result.message ?? "errors.unexpected");
      onSuccess?.();
      if (result.message) toast("success", tRoot(result.message));
    });
  };

  const senderName = (m: Pick<ThreadMessage, "sender_first_name" | "sender_last_name">) =>
    `${m.sender_first_name ?? ""} ${m.sender_last_name ?? ""}`.trim() || t("unknownUser");

  let previousDay = "";
  let previousSender: string | null = null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5 sm:px-4">
        <Link href="/messages" className={buttonClasses("ghost", "icon-sm", "lg:hidden")} aria-label={t("back")}>
          <ArrowLeft aria-hidden />
        </Link>
        {conversation.type === "direct" ? (
          <Avatar name={conversation.title} src={other?.avatar_url} size="sm" />
        ) : (
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-surface-muted text-ink-secondary" aria-hidden>
            <Users className="size-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-ink">{conversation.title}</h1>
          {conversation.type !== "direct" ? <p className="text-xs text-ink-muted">{t("memberCount", { count: members.length })}</p> : null}
        </div>
        <Overlay.DropdownMenu>
          <Overlay.DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("conversationMenu")}>
              <EllipsisVertical aria-hidden />
            </Button>
          </Overlay.DropdownMenuTrigger>
          <Overlay.DropdownMenuContent>
            <Overlay.DropdownMenuItem onSelect={() => runAction(() => setMutedAction(conversation.id, !conversation.isMuted), () => router.refresh())}>
              {conversation.isMuted ? <Bell aria-hidden /> : <BellOff aria-hidden />}
              {conversation.isMuted ? t("unmute") : t("mute")}
            </Overlay.DropdownMenuItem>
            {conversation.type !== "direct" ? (
              <Overlay.DropdownMenuItem onSelect={() => setMembersOpen(true)}>
                <Users aria-hidden />
                {t("members")}
              </Overlay.DropdownMenuItem>
            ) : null}
            {other ? (
              <Overlay.DropdownMenuItem tone="danger" onSelect={() => runAction(() => setBlockedAction(other.user_id, !iBlockedOther), () => router.refresh())}>
                <Ban aria-hidden />
                {iBlockedOther ? t("unblock") : t("block")}
              </Overlay.DropdownMenuItem>
            ) : null}
            {conversation.type !== "direct" ? (
              <>
                <Overlay.DropdownMenuSeparator />
                <Overlay.DropdownMenuItem tone="danger" onSelect={() => runAction(() => removeGroupMemberAction(conversation.id, currentUserId))}>
                  <LogOut aria-hidden />
                  {t("leave")}
                </Overlay.DropdownMenuItem>
              </>
            ) : null}
          </Overlay.DropdownMenuContent>
        </Overlay.DropdownMenu>
      </header>

      {pinned.length > 0 ? (
        <div className="border-b border-line bg-surface-muted/60 px-4 py-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
            <Pin className="size-3.5" aria-hidden />
            {t("pinned")}
          </p>
          <ul className="mt-1 space-y-0.5">
            {pinned.slice(-3).map((p) => (
              <li key={p.id} className="truncate text-sm text-ink">
                <span className="font-medium">{senderName(p)}:</span> {p.content}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5" role="log" aria-live="polite" aria-relevant="additions" aria-label={t("history")}>
        {hasMore ? (
          <div className="mb-4 text-center">
            <Button variant="secondary" size="sm" onClick={loadOlder} loading={loadingOlder}>
              {t("loadOlder")}
            </Button>
          </div>
        ) : null}
        {messages.length === 0 ? <p className="py-10 text-center text-sm text-ink-muted">{t("emptyThread")}</p> : null}
        <ol className="space-y-1">
          {messages.map((m) => {
            const day = dayKey(m.created_at, timeZone);
            const showDay = day !== previousDay;
            const mine = m.sender_id === currentUserId;
            const showSender = !mine && conversation.type !== "direct" && (showDay || previousSender !== m.sender_id);
            previousDay = day;
            previousSender = m.sender_id;
            const reply = m.reply_to_id ? byId.get(m.reply_to_id) : undefined;
            const canEdit = mine && !m.is_deleted && Date.now() - new Date(m.created_at).getTime() < EDIT_WINDOW_MS;
            const canPin = !m.is_deleted && (conversation.type === "direct" || myRole === "admin");

            return (
              <Fragment key={m.id}>
                {showDay ? (
                  <li className="py-3 text-center" aria-hidden={false}>
                    <span className="rounded-md bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-secondary">{formatDate(m.created_at, locale, timeZone)}</span>
                  </li>
                ) : null}
                <li className={cn("group flex gap-2", mine ? "justify-end" : "justify-start", showSender && "pt-2")}>
                  <div className={cn("flex max-w-[85%] items-end gap-1 sm:max-w-[70%]", mine && "flex-row-reverse")}>
                    <div
                      className={cn(
                        "min-w-0 rounded-lg border px-3 py-2 text-sm",
                        mine ? "border-brand-200 bg-brand-50 text-ink" : "border-line bg-surface text-ink",
                        m.is_deleted && "border-dashed bg-surface text-ink-muted"
                      )}
                    >
                      {showSender ? <p className="mb-0.5 text-xs font-semibold text-brand-800">{senderName(m)}</p> : null}
                      {reply || m.reply_to_id ? (
                        <p className="mb-1 truncate border-s-2 border-brand-300 ps-2 text-xs text-ink-secondary">
                          {reply ? `${senderName(reply)}: ${reply.is_deleted ? t("deletedMessage") : reply.content}` : t("replyEarlier")}
                        </p>
                      ) : null}
                      {m.is_deleted ? (
                        <p className="italic">{t("deletedMessage")}</p>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{m.content}</p>
                      )}
                      <p className="mt-1 flex items-center justify-end gap-1.5 text-[0.6875rem] text-ink-muted tabular">
                        {m.is_pinned ? <Pin className="size-3" aria-label={t("pinnedMessage")} /> : null}
                        {m.is_favorite ? <Star className="size-3 fill-current" aria-label={t("favorite")} /> : null}
                        {m.is_edited && !m.is_deleted ? <span>{t("edited")}</span> : null}
                        <time dateTime={m.created_at}>{formatClock(m.created_at, locale, timeZone)}</time>
                      </p>
                    </div>
                    {!m.is_deleted ? (
                      <Overlay.DropdownMenu>
                        <Overlay.DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="rounded p-1 text-ink-muted opacity-100 hover:bg-surface-muted hover:text-ink focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 data-[state=open]:opacity-100"
                            aria-label={t("messageActions")}
                          >
                            <EllipsisVertical className="size-4" aria-hidden />
                          </button>
                        </Overlay.DropdownMenuTrigger>
                        <Overlay.DropdownMenuContent align={mine ? "end" : "start"}>
                          {canPost ? (
                            <Overlay.DropdownMenuItem onSelect={() => { setEditing(null); setReplyTo(m); inputRef.current?.focus(); }}>
                              <CornerUpLeft aria-hidden />
                              {t("reply")}
                            </Overlay.DropdownMenuItem>
                          ) : null}
                          <Overlay.DropdownMenuItem onSelect={() => { void navigator.clipboard?.writeText(m.content); toast("success", tRoot("common.copied")); }}>
                            <Copy aria-hidden />
                            {tRoot("common.copy")}
                          </Overlay.DropdownMenuItem>
                          <Overlay.DropdownMenuItem onSelect={() => runAction(() => toggleMessageFavoriteAction(m.id, !m.is_favorite), () => upsert({ ...m, is_favorite: !m.is_favorite }))}>
                            <Star aria-hidden />
                            {m.is_favorite ? t("unfavorite") : t("favorite")}
                          </Overlay.DropdownMenuItem>
                          {canPin ? (
                            <Overlay.DropdownMenuItem onSelect={() => runAction(() => setMessagePinnedAction(m.id, !m.is_pinned))}>
                              {m.is_pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
                              {m.is_pinned ? t("unpin") : t("pin")}
                            </Overlay.DropdownMenuItem>
                          ) : null}
                          {canEdit ? (
                            <Overlay.DropdownMenuItem onSelect={() => { setReplyTo(null); setEditing(m); setDraft(m.content); inputRef.current?.focus(); }}>
                              <Pencil aria-hidden />
                              {tRoot("common.edit")}
                            </Overlay.DropdownMenuItem>
                          ) : null}
                          <Overlay.DropdownMenuSeparator />
                          <Overlay.DropdownMenuItem onSelect={() => runAction(() => deleteMessageAction(m.id, "me"), () => setMessages((c) => c.filter((x) => x.id !== m.id)))}>
                            <Trash2 aria-hidden />
                            {t("deleteForMe")}
                          </Overlay.DropdownMenuItem>
                          {mine ? (
                            <Overlay.DropdownMenuItem tone="danger" onSelect={() => runAction(() => deleteMessageAction(m.id, "everyone"), () => upsert({ ...m, is_deleted: true, content: "" }))}>
                              <Trash2 aria-hidden />
                              {t("deleteForEveryone")}
                            </Overlay.DropdownMenuItem>
                          ) : (
                            <Overlay.DropdownMenuItem tone="danger" onSelect={() => setReporting(m)}>
                              <Flag aria-hidden />
                              {t("report")}
                            </Overlay.DropdownMenuItem>
                          )}
                        </Overlay.DropdownMenuContent>
                      </Overlay.DropdownMenu>
                    ) : null}
                  </div>
                </li>
              </Fragment>
            );
          })}
        </ol>
      </div>

      <footer className="border-t border-line bg-surface px-3 py-3 sm:px-4">
        {iBlockedOther ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-secondary">
            <span>{t("youBlocked")}</span>
            <Button variant="secondary" size="sm" onClick={() => other && runAction(() => setBlockedAction(other.user_id, false), () => router.refresh())}>
              {t("unblock")}
            </Button>
          </div>
        ) : !canPost ? (
          <p className="text-sm text-ink-muted">{t("readOnlyChannel")}</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {replyTo || editing ? (
              <div className="mb-2 flex items-center gap-2 rounded-md bg-surface-muted px-3 py-1.5 text-sm">
                {editing ? <Pencil className="size-4 shrink-0 text-ink-muted" aria-hidden /> : <CornerUpLeft className="size-4 shrink-0 text-ink-muted" aria-hidden />}
                <span className="min-w-0 flex-1 truncate">
                  {editing ? t("editing") : t("replyingTo", { name: senderName(replyTo!) })}
                  {replyTo ? <span className="text-ink-muted"> — {replyTo.content}</span> : null}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (editing) setDraft("");
                    setEditing(null);
                    setReplyTo(null);
                  }}
                  className="rounded p-0.5 text-ink-muted hover:text-ink"
                  aria-label={tRoot("common.cancel")}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <label htmlFor="message-input" className="sr-only">
                {t("composer")}
              </label>
              <Textarea
                id="message-input"
                ref={inputRef}
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                maxLength={MESSAGE_MAX_LENGTH}
                placeholder={t("composerPlaceholder")}
                className="max-h-40 min-h-10 resize-none"
                aria-describedby="message-hint"
              />
              <Button type="submit" size="icon" loading={sending} disabled={!draft.trim()} aria-label={editing ? tRoot("common.save") : t("send")}>
                {sending ? null : <SendHorizontal aria-hidden />}
              </Button>
            </div>
            <p id="message-hint" className="sr-only">{t("composerHint")}</p>
          </form>
        )}
      </footer>

      <ReportDialog message={reporting} onClose={() => setReporting(null)} onSubmit={(reason, details) => {
        const target = reporting;
        if (!target) return;
        runAction(() => reportMessageAction(target.id, reason, details), () => setReporting(null));
      }} />

      {conversation.type !== "direct" ? (
        <GroupMembersDialog
          open={membersOpen}
          onOpenChange={setMembersOpen}
          conversationId={conversation.id}
          title={conversation.title}
          members={members}
          currentUserId={currentUserId}
          isAdmin={myRole === "admin" && canManageMembers}
        />
      ) : null}
    </div>
  );
}

function ReportDialog({ message, onClose, onSubmit }: { message: ThreadMessage | null; onClose: () => void; onSubmit: (reason: string, details: string) => void }) {
  const t = useTranslations("portal.messages");
  const tc = useTranslations("common");
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  return (
    <Overlay.Dialog open={message !== null} onOpenChange={(open) => { if (!open) { onClose(); setDetails(""); } }}>
      <Overlay.DialogContent title={t("reportTitle")} description={t("reportDescription")} closeLabel={tc("close")} size="sm">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(reason, details);
          }}
        >
          <div>
            <label htmlFor="report-reason" className="mb-1.5 block text-sm font-medium text-ink">{t("reportReason")}</label>
            <Select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REPORT_REASONS.map((r) => (
                <option key={r} value={r}>{t(`reasons.${r}`)}</option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="report-details" className="mb-1.5 block text-sm font-medium text-ink">
              {t("reportDetails")} <span className="font-normal text-ink-muted">({tc("optional")})</span>
            </label>
            <Textarea id="report-details" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={3} />
          </div>
          <div className="flex justify-end gap-2">
            <Overlay.DialogClose asChild>
              <Button variant="secondary">{tc("cancel")}</Button>
            </Overlay.DialogClose>
            <Button type="submit" variant="danger">{t("sendReport")}</Button>
          </div>
        </form>
      </Overlay.DialogContent>
    </Overlay.Dialog>
  );
}
