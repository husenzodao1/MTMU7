"use client";

import {
  ArrowLeft,
  Ban,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Clock,
  Copy,
  CornerUpLeft,
  EllipsisVertical,
  Flag,
  Headset,
  LogOut,
  MapPin,
  Pencil,
  Pin,
  PinOff,
  SendHorizontal,
  Star,
  Trash2,
  TriangleAlert,
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
  removeGroupMemberAction,
  reportMessageAction,
  setBlockedAction,
  setMessagePinnedAction,
  setMutedAction,
  toggleMessageFavoriteAction,
} from "@/features/messages/actions";
import { GroupMembersDialog } from "@/features/messages/group-members";
import { announceMessage } from "@/features/push/client";
import { dbErrorKey } from "@/lib/actions/db-error-key";
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
  /** Who opened it. For the support desk this decides what "seen" means. */
  createdBy?: string | null;
  /** A line under the title: the desk's promise, a group's size. */
  subtitle?: string;
}

/**
 * Marks the conversation read, straight from the browser. The second tick on
 * the other side turns over as soon as this lands, so it should not wait for a
 * round trip through the portal's own server first.
 *
 * Throttled: in a busy group every arriving line would otherwise be an update
 * to the reader's membership row, and every such update is sent on to
 * everybody with the conversation open. The first mark goes at once, so the
 * sender's second tick is not held back; the rest within a second and a half
 * fold into one more at the end.
 */
const readCooldown = new Map<string, { timer: ReturnType<typeof setTimeout>; again: boolean }>();
function sendRead(conversationId: string) {
  // A supabase-js query runs when something asks for its result, so it is
  // asked for here even though nothing is done with it.
  getBrowserClient()
    .rpc("mark_conversation_read", { p_conversation_id: conversationId })
    .then(
      () => undefined,
      () => undefined
    );
}
function markRead(conversationId: string) {
  const cooling = readCooldown.get(conversationId);
  if (cooling) {
    cooling.again = true;
    return;
  }
  sendRead(conversationId);
  const entry = {
    again: false,
    timer: setTimeout(() => {
      readCooldown.delete(conversationId);
      if (entry.again) markRead(conversationId);
    }, 1500),
  };
  readCooldown.set(conversationId, entry);
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
  location_lat: number | null;
  location_lng: number | null;
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
  schoolId,
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
  schoolId: string;
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
  // Only an edit waits for the server. A new message never does: see deliver().
  const [saving, startSaving] = useTransition();
  const [loadingOlder, startLoadingOlder] = useTransition();
  const [, startAction] = useTransition();
  // Clock for the edit window, refreshed so the edit option disappears once it expires.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const preserveScroll = useRef<number | null>(null);
  const stickToBottom = useRef(true);

  // What realtime has said since the page was rendered, laid over the props
  // rather than copied from them. Copying props into state needs an effect to
  // keep the two in step, and an effect that sets state on every render of the
  // parent is a render loop waiting to happen; a lookup merged at read time
  // cannot fall behind because there is nothing to fall behind.
  const [readSince, setReadSince] = useState<Record<string, string | null>>({});
  const members = useMemo(
    () => initialMembers.map((m) => (m.user_id in readSince ? { ...m, last_read_at: readSince[m.user_id] } : m)),
    [initialMembers, readSince]
  );
  const memberMap = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);

  // The moment the last of the others caught up. One number, however many
  // people are in the room: a second tick that appeared when the first of
  // thirty parents looked would be telling the sender something untrue.
  //
  // The support desk is the exception, because it is one side of a two-sided
  // conversation however many people staff it. The person who asked has been
  // read once anybody at the desk has read them; the desk has been read once
  // the person who asked has.
  const isSupport = conversation.type === "support";
  const requesterId = conversation.createdBy ?? null;
  const othersReadAt = useMemo(() => {
    const others = members.filter((m) => m.user_id !== currentUserId);
    if (others.length === 0) return null;
    const times = (list: ConversationMember[]) =>
      list.map((m) => (m.last_read_at ? new Date(m.last_read_at).getTime() : null));
    if (isSupport && requesterId) {
      if (currentUserId === requesterId) {
        const read = times(others).filter((v): v is number => v !== null);
        return read.length > 0 ? Math.max(...read) : null;
      }
      const requester = others.find((m) => m.user_id === requesterId);
      return requester?.last_read_at ? new Date(requester.last_read_at).getTime() : null;
    }
    let earliest = Infinity;
    for (const time of times(others)) {
      if (time === null) return null;
      earliest = Math.min(earliest, time);
    }
    return Number.isFinite(earliest) ? earliest : null;
  }, [members, currentUserId, isSupport, requesterId]);

  const receiptLabels = useMemo(
    () => ({ sending: t("receipt.sending"), sent: t("receipt.sent"), seen: t("receipt.seen"), failed: t("receipt.failed") }),
    [t]
  );

  const [locating, setLocating] = useState(false);

  const fail = useCallback((key: string) => toast("danger", tRoot(key)), [toast, tRoot]);

  const upsert = useCallback((incoming: ThreadMessage) => {
    setMessages((current) => {
      const index = current.findIndex((m) => m.id === incoming.id);
      if (index === -1) return sortAsc([...current, incoming]);
      const next = [...current];
      next[index] = { ...current[index]!, ...incoming };
      return next;
    });
  }, []);

  // Messages leave one after another, in the order they were typed, and the
  // composer never waits for any of them: the bubble is on screen at once with
  // a clock, and the next sentence can be typed while the first is travelling.
  const queue = useRef<Promise<void>>(Promise.resolve());

  /**
   * Writes one message, straight from the browser to the database.
   *
   * Row level security and the guard trigger decide whether it may be written,
   * exactly as they did when this went through a Server Action — the portal's
   * own server added a round trip and nothing else. The push to everybody
   * else is asked for once the row exists.
   */
  const deliver = useCallback(
    (local: ThreadMessage) => {
      upsert(local);
      queue.current = queue.current.then(async () => {
        const { data, error } = await getBrowserClient()
          .from("messages")
          .insert({
            conversation_id: local.conversation_id,
            sender_id: currentUserId,
            school_id: schoolId,
            content: local.content,
            type: local.type,
            reply_to_id: local.reply_to_id,
            location_lat: local.location_lat,
            location_lng: local.location_lng,
          })
          .select("id")
          // A request that never answers would hold every later message
          // behind it; after twenty seconds it is failed, and one tap resends.
          .abortSignal(AbortSignal.timeout(20_000))
          .single();
        if (error || !data) {
          // Kept on screen, marked, and one tap from being sent again — never
          // silently swallowed.
          setMessages((current) => current.map((m) => (m.id === local.id ? { ...m, pending: false, failed: true } : m)));
          fail((error && dbErrorKey(error)) ?? "errors.unexpected");
          return;
        }
        const serverId = data.id;
        setMessages((current) => {
          // Realtime may have delivered the real row already; if so the local
          // one simply goes, rather than appearing twice.
          const arrived = current.some((m) => m.id === serverId);
          const next = arrived
            ? current.filter((m) => m.id !== local.id)
            : current.map((m) => (m.id === local.id ? { ...m, id: serverId, pending: false } : m));
          return sortAsc(next);
        });
        announceMessage(serverId);
      });
    },
    [currentUserId, schoolId, upsert, fail]
  );

  const localMessage = useCallback(
    (fields: Pick<ThreadMessage, "content" | "type" | "reply_to_id" | "location_lat" | "location_lng">): ThreadMessage => {
      const me = members.find((m) => m.user_id === currentUserId);
      return {
        id: `local:${crypto.randomUUID()}`,
        conversation_id: conversation.id,
        sender_id: currentUserId,
        sender_first_name: me?.first_name ?? null,
        sender_last_name: me?.last_name ?? null,
        sender_avatar_url: me?.avatar_url ?? null,
        is_pinned: false,
        is_edited: false,
        is_deleted: false,
        is_favorite: false,
        created_at: new Date().toISOString(),
        edited_at: null,
        pending: true,
        ...fields,
      };
    },
    [members, currentUserId, conversation.id]
  );

  const retry = useCallback(
    (failed: ThreadMessage) => {
      setMessages((current) => current.filter((m) => m.id !== failed.id));
      deliver(localMessage({
        content: failed.content,
        type: failed.type,
        reply_to_id: failed.reply_to_id,
        location_lat: failed.location_lat,
        location_lng: failed.location_lng,
      }));
    },
    [deliver, localMessage]
  );

  /**
   * Sends where you are, once, after the browser has asked.
   *
   * Nothing is watched and nothing is remembered: this asks for a single
   * position at the moment the button is pressed. A refusal is a refusal — it
   * says so and stops, rather than asking again on the next tap.
   */
  const shareLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      toast("danger", t("locationUnsupported"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        // Rounded here as well as in the column: a browser will happily report
        // fourteen decimal places, a claim no phone can support.
        const latitude = Number(position.coords.latitude.toFixed(6));
        const longitude = Number(position.coords.longitude.toFixed(6));
        const label = draft.trim().slice(0, 200);
        setDraft("");
        stickToBottom.current = true;
        deliver(localMessage({ content: label, type: "location", reply_to_id: null, location_lat: latitude, location_lng: longitude }));
      },
      (error) => {
        setLocating(false);
        toast("danger", error.code === error.PERMISSION_DENIED ? t("locationDenied") : t("locationFailed"));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 }
    );
  }, [draft, t, toast, deliver, localMessage]);
  const other = conversation.type === "direct" ? members.find((m) => m.user_id !== currentUserId) : undefined;
  const iBlockedOther = Boolean(other && blockedUserIds.includes(other.user_id));
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

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

  // Realtime: RLS delivers only messages of conversations the user belongs to.
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`thread:${conversation.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` }, (payload) => {
        const row = payload.new as MessageRow;
        const sender = row.sender_id ? memberMap.get(row.sender_id) : undefined;
        if (row.sender_id === currentUserId) {
          // Our own message, back from realtime before the insert answered:
          // it takes the place of the bubble already on screen instead of
          // standing beside it until the answer arrives.
          setMessages((current) => {
            if (current.some((m) => m.id === row.id)) return current;
            const local = current.find((m) => m.pending && m.content === row.content && m.type === row.type);
            const arrived: ThreadMessage = {
              ...row,
              sender_first_name: sender?.first_name ?? null,
              sender_last_name: sender?.last_name ?? null,
              sender_avatar_url: sender?.avatar_url ?? null,
              is_favorite: false,
            };
            return sortAsc(local ? current.map((m) => (m.id === local.id ? arrived : m)) : [...current, arrived]);
          });
          return;
        }
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
        if (document.visibilityState === "visible") markRead(conversation.id);
      })
      // Somebody opened the conversation: their last_read_at changed, and the
      // sender is owed the second tick without reloading anything.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation_members", filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          const row = payload.new as { user_id: string; last_read_at: string | null };
          setReadSince((current) => ({ ...current, [row.user_id]: row.last_read_at }));
        }
      )
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
      if (document.visibilityState === "visible") markRead(conversation.id);
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
    if (!content) return;
    if (editing) {
      if (saving) return;
      const target = editing;
      startSaving(async () => {
        const result = await editMessageAction(target.id, content);
        if (!result.ok) return fail(result.message);
        upsert({ ...target, content, is_edited: true });
        setEditing(null);
        setDraft("");
      });
      return;
    }

    // The message appears the moment it is typed, not when the server agrees.
    // The draft clears, the bubble is there with a clock, and the box is ready
    // for the next sentence before the first has arrived anywhere.
    stickToBottom.current = true;
    setDraft("");
    setReplyTo(null);
    deliver(localMessage({ content, type: "text", reply_to_id: replyTo?.id ?? null, location_lat: null, location_lng: null }));
    inputRef.current?.focus();
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

  // Day separators and sender labels depend on the preceding message.
  const rows = useMemo(
    () =>
      messages.map((message, index) => {
        const previous = index > 0 ? messages[index - 1] : undefined;
        const day = dayKey(message.created_at, timeZone);
        return {
          message,
          showDay: !previous || dayKey(previous.created_at, timeZone) !== day,
          previousSenderId: previous?.sender_id ?? null,
        };
      }),
    [messages, timeZone]
  );

  const backHref = isSupport && currentUserId === requesterId ? "/dashboard" : "/messages";
  const subtitle =
    conversation.subtitle ?? (conversation.type !== "direct" && !isSupport ? t("memberCount", { count: members.length }) : undefined);

  return (
    <div className="chat flex h-full min-h-0 flex-col">
      <header className="chat-header flex items-center gap-2 px-2.5 py-2 sm:px-4">
        <Link href={backHref} className={buttonClasses("ghost", "icon-sm", isSupport ? "" : "lg:hidden")} aria-label={t("back")}>
          <ArrowLeft aria-hidden />
        </Link>
        {isSupport ? (
          <span className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-solid text-brand-on-solid" aria-hidden>
            <Headset className="size-5" />
            <span className="absolute bottom-0 end-0 size-2.5 rounded-full bg-success-600 ring-2 ring-surface" />
          </span>
        ) : conversation.type === "direct" ? (
          <Avatar name={conversation.title} src={other?.avatar_url} size="md" />
        ) : (
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-secondary" aria-hidden>
            <Users className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[0.9375rem] font-semibold leading-tight text-ink">{conversation.title}</h1>
          {subtitle ? <p className="truncate text-xs text-ink-muted">{subtitle}</p> : null}
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
            {conversation.type !== "direct" && !isSupport ? (
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
            {conversation.type !== "direct" && !isSupport ? (
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
        <div className="chat-header px-4 py-2">
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

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="chat-wall min-h-0 flex-1 overflow-y-auto px-2.5 py-3 sm:px-[6%]"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={t("history")}
      >
        {hasMore ? (
          <div className="mb-3 text-center">
            <Button variant="secondary" size="sm" onClick={loadOlder} loading={loadingOlder}>
              {t("loadOlder")}
            </Button>
          </div>
        ) : null}
        {messages.length === 0 ? (
          <div className="mx-auto mt-6 max-w-xs rounded-xl bg-[var(--chat-notice)] px-4 py-3 text-center text-xs leading-relaxed text-ink-secondary shadow-xs">
            {isSupport ? t("supportEmpty") : t("emptyThread")}
          </div>
        ) : null}
        <ol className="space-y-0.5">
          {rows.map(({ message: m, showDay, previousSenderId }) => {
            const mine = m.sender_id === currentUserId;
            const firstOfRun = showDay || previousSenderId !== m.sender_id;
            const showSender = !mine && conversation.type !== "direct" && firstOfRun;
            const reply = m.reply_to_id ? byId.get(m.reply_to_id) : undefined;
            const canEdit = mine && !m.is_deleted && m.type === "text" && now - new Date(m.created_at).getTime() < EDIT_WINDOW_MS;
            const canPin = !m.is_deleted && (conversation.type === "direct" || myRole === "admin");

            return (
              <Fragment key={m.id}>
                {showDay ? (
                  <li className="sticky top-0 z-[1] py-2 text-center" aria-hidden={false}>
                    <span className="rounded-lg bg-[var(--chat-notice)] px-3 py-1 text-[0.6875rem] font-medium uppercase tracking-wide text-ink-secondary shadow-xs">
                      {formatDate(m.created_at, locale, timeZone)}
                    </span>
                  </li>
                ) : null}
                <li className={cn("group flex", mine ? "justify-end" : "justify-start", firstOfRun && "pt-1.5")}>
                  <div className={cn("flex max-w-[88%] items-end gap-1 sm:max-w-[72%]", mine && "flex-row-reverse")}>
                    <div
                      className={cn(
                        "chat-bubble min-w-0 px-2.5 pb-1 pt-1.5 text-sm",
                        mine ? "chat-bubble-mine" : "chat-bubble-theirs",
                        firstOfRun && (mine ? "chat-tail-mine" : "chat-tail-theirs"),
                        m.is_deleted && "italic text-ink-muted"
                      )}
                    >
                      {showSender ? <p className="mb-0.5 text-xs font-semibold text-brand-text-strong">{senderName(m)}</p> : null}
                      {reply || m.reply_to_id ? (
                        <p className="mb-1 truncate rounded-md border-s-4 border-brand-500 bg-[var(--chat-quote)] px-2 py-1 text-xs text-ink-secondary">
                          {reply ? `${senderName(reply)}: ${reply.is_deleted ? t("deletedMessage") : reply.type === "location" ? t("locationShort") : reply.content}` : t("replyEarlier")}
                        </p>
                      ) : null}
                      {m.is_deleted ? (
                        <p className="inline">{t("deletedMessage")}</p>
                      ) : m.type === "location" && m.location_lat !== null && m.location_lng !== null ? (
                        <LocationCard lat={Number(m.location_lat)} lng={Number(m.location_lng)} label={m.content} openLabel={t("openMap")} title={t("locationShort")} />
                      ) : (
                        <p className="inline whitespace-pre-wrap break-words">{m.content}</p>
                      )}
                      <span className="chat-meta float-end ms-2 mt-1.5 flex translate-y-0.5 items-center gap-1 text-[0.6875rem] leading-none tabular">
                        {m.is_pinned ? <Pin className="size-3" aria-label={t("pinnedMessage")} /> : null}
                        {m.is_favorite ? <Star className="size-3 fill-current" aria-label={t("favorite")} /> : null}
                        {m.is_edited && !m.is_deleted ? <span>{t("edited")}</span> : null}
                        <time dateTime={m.created_at}>{formatClock(m.created_at, locale, timeZone)}</time>
                        {mine && !m.is_deleted ? <Receipt message={m} seenAt={othersReadAt} labels={receiptLabels} onRetry={retry} /> : null}
                      </span>
                    </div>
                    {!m.is_deleted && !m.pending && !m.failed ? (
                      <Overlay.DropdownMenu>
                        <Overlay.DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="rounded-full p-1 text-ink-muted opacity-100 hover:bg-surface/70 hover:text-ink focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 data-[state=open]:opacity-100"
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
                          <Overlay.DropdownMenuItem
                            onSelect={() => {
                              const text = m.type === "location" && m.location_lat !== null ? `${m.location_lat},${m.location_lng}` : m.content;
                              void navigator.clipboard?.writeText(text);
                              toast("success", tRoot("common.copied"));
                            }}
                          >
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
                            <Overlay.DropdownMenuItem tone="danger" onSelect={() => runAction(() => deleteMessageAction(m.id, "everyone"), () => upsert({ ...m, is_deleted: true, content: "", location_lat: null, location_lng: null }))}>
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

      <footer className="chat-composer px-2 py-2 sm:px-3">
        {iBlockedOther ? (
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1 text-sm text-ink-secondary">
            <span>{t("youBlocked")}</span>
            <Button variant="secondary" size="sm" onClick={() => other && runAction(() => setBlockedAction(other.user_id, false), () => router.refresh())}>
              {t("unblock")}
            </Button>
          </div>
        ) : !canPost ? (
          <p className="px-2 py-1 text-sm text-ink-muted">{t("readOnlyChannel")}</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {replyTo || editing ? (
              <div className="mb-1.5 flex items-center gap-2 rounded-xl border-s-4 border-brand-500 bg-surface px-3 py-1.5 text-sm shadow-xs">
                {editing ? <Pencil className="size-4 shrink-0 text-ink-muted" aria-hidden /> : <CornerUpLeft className="size-4 shrink-0 text-ink-muted" aria-hidden />}
                <span className="min-w-0 flex-1 truncate">
                  {editing ? t("editing") : t("replyingTo", { name: senderName(replyTo!) })}
                  {replyTo ? <span className="text-ink-muted"> — {replyTo.type === "location" ? t("locationShort") : replyTo.content}</span> : null}
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
            <div className="flex items-end gap-1.5">
              <div className="flex min-w-0 flex-1 items-end rounded-3xl bg-surface px-1 shadow-xs ring-1 ring-line/60">
                {!editing ? (
                  <button
                    type="button"
                    onClick={shareLocation}
                    disabled={locating}
                    aria-label={t("sendLocation")}
                    title={t("sendLocation")}
                    className="m-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-muted hover:text-brand-text disabled:animate-pulse"
                  >
                    <MapPin className="size-5" aria-hidden />
                  </button>
                ) : null}
                <label htmlFor="message-input" className="sr-only">
                  {t("composer")}
                </label>
                <textarea
                  id="message-input"
                  ref={inputRef}
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  maxLength={MESSAGE_MAX_LENGTH}
                  placeholder={t("composerPlaceholder")}
                  className="field-sizing-content max-h-36 min-h-11 w-full min-w-0 resize-none bg-transparent px-2 py-2.5 text-[0.9375rem] leading-6 text-ink placeholder:text-ink-muted focus:outline-none"
                  aria-describedby="message-hint"
                />
              </div>
              <button
                type="submit"
                disabled={!draft.trim() || saving}
                aria-label={editing ? tRoot("common.save") : t("send")}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-solid text-brand-on-solid shadow-sm transition-[transform,background-color] hover:bg-brand-solid-hover active:scale-95 disabled:opacity-50"
              >
                {editing ? <Check className="size-5" aria-hidden /> : <SendHorizontal className="size-5" aria-hidden />}
              </button>
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

      {conversation.type !== "direct" && !isSupport ? (
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

/**
 * One tick, two ticks.
 *
 * A clock while the message is still on its way, one tick once the server has
 * it, two blue ones once it has been read — by everyone else in a group, by
 * the other side of a support conversation. A message that did not make it is
 * marked in red, and tapping the mark sends it again.
 *
 * `seenAt` is a single moment worked out once per conversation, so the
 * comparison is one number against one number however many people are in the
 * room.
 */
function Receipt({
  message,
  seenAt,
  labels,
  onRetry,
}: {
  message: ThreadMessage;
  seenAt: number | null;
  labels: { sending: string; sent: string; seen: string; failed: string };
  onRetry: (message: ThreadMessage) => void;
}) {
  if (message.failed) {
    return (
      <button type="button" onClick={() => onRetry(message)} title={labels.failed} aria-label={labels.failed} className="text-danger-600 hover:text-danger-700">
        <TriangleAlert className="size-3.5" aria-hidden />
      </button>
    );
  }
  if (message.pending) {
    return (
      <span title={labels.sending}>
        <Clock className="size-3" aria-label={labels.sending} />
      </span>
    );
  }
  const seen = seenAt !== null && seenAt >= new Date(message.created_at).getTime();
  return (
    <span title={seen ? labels.seen : labels.sent} className={seen ? "chat-seen" : undefined}>
      {seen ? <CheckCheck className="size-4" strokeWidth={2.25} aria-label={labels.seen} /> : <Check className="size-4" strokeWidth={2.25} aria-label={labels.sent} />}
    </span>
  );
}

/**
 * A place, drawn rather than described.
 *
 * No map tiles: a tile provider would be a third party watching every location
 * anybody in the school sends, which is a poor trade for a picture. The card
 * shows the coordinates and hands off to whatever map the person already has.
 */
function LocationCard({ lat, lng, label, openLabel, title }: { lat: number; lng: number; label: string; openLabel: string; title: string }) {
  const point = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return (
    <span className="block min-w-52">
      <a
        href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="chat-map mb-1 flex h-28 items-center justify-center overflow-hidden rounded-lg"
        aria-label={openLabel}
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-danger-600 text-white shadow-md ring-4 ring-white/70">
          <MapPin className="size-6" aria-hidden />
        </span>
      </a>
      <span className="block text-sm font-medium text-ink">{label || title}</span>
      <span className="block truncate text-xs text-ink-muted tabular">{point}</span>
      <a
        href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-block text-xs font-semibold text-brand-text hover:underline"
      >
        {openLabel}
      </a>
    </span>
  );
}
