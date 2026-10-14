"use client";

import { AlertCircle, Bell, BellOff, Headset, Megaphone, Pin, PinOff, Search, Trash2, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/misc";
import * as Overlay from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { setMutedAction } from "@/features/messages/actions";
import { LIST_OPS_EVENT, clearedChats, clearedCutoffs, pendingListOps, queueListOp, setClearedChats, setClearedUpTo, type Cleared, type ListOp } from "@/features/messages/list-ops";
import { forgetConversation, keepList, keptList, newestKept } from "@/features/messages/local-store";
import { ChannelsDialog } from "@/features/messages/channels";
import { NewConversationButton } from "@/features/messages/new-conversation";
import { StoriesRow, type StoryAuthor } from "@/features/messages/stories";
import { Ticks, tickState } from "@/features/messages/ticks";
import { warmPage } from "@/components/shell/warm-pages";
import { OUTBOX_EVENT, READ_EVENT, UNREAD_TOTAL_EVENT } from "@/features/messages/events";
import { OUTBOX_KEY, waitingRows, type OutgoingRow } from "@/features/messages/outbox";
import { renewKeptPage } from "@/lib/kept-pages";
import { getBrowserClient, listen } from "@/lib/supabase/browser";
import { dayKey, formatClock, formatShortDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { cn } from "@/lib/utils/cn";
import { conversationTitle, isBroadcast, type ConversationMember, type ThreadMessage } from "@/features/messages/types";
import { fold } from "@/lib/search/fold";

export interface ConversationSummary {
  id: string;
  type: string;
  name: string | null;
  avatar_url: string | null;
  is_muted: boolean;
  last_message_content: string | null;
  last_message_sender_id: string | null;
  last_message_at: string | null;
  last_message_deleted: boolean | null;
  unread_count: number;
  updated_at: string;
  members: ConversationMember[] | null;
  created_by?: string | null;
  last_message_type?: string | null;
  /** From 00094 on; absent before it, which only leaves the ticks out. */
  description?: string | null;
  my_role?: string | null;
  member_count?: number | null;
  peer_read_at?: string | null;
  peer_delivered_at?: string | null;
  /** From 00098 on: pinned to the top by this person, and when. */
  pinned_at?: string | null;
}

/** What realtime has said about a conversation since the list was rendered. */
interface Live {
  content: string;
  sender_id: string | null;
  created_at: string;
  type: string;
  unread: number;
}

type Filter = "all" | "unread" | "groups" | "channels";

/** Timestamps from the server and from realtime are compared as instants, not as text. */
const time = (value: string) => new Date(value).getTime() || 0;
const later = (a: string | null | undefined, b: string | null | undefined) => (!a ? b ?? null : !b ? a : time(a) >= time(b) ? a : b);

/**
 * The list of conversations, set out like the messenger everybody knows: a
 * large title, one rounded search field, the row of stories, a few chips to
 * narrow the list, and the conversations themselves — a round picture, the
 * name and the time on one line, the last message under it with the ticks
 * before one's own, and the count of what is unread in a small round badge.
 * A round button in the corner starts a new conversation.
 */
export function ConversationList({
  conversations,
  currentUserId,
  timeZone,
  canCreateGroup,
  stories,
  me,
  schoolId,
  channelsEnabled,
}: {
  conversations: ConversationSummary[];
  currentUserId: string;
  timeZone: string;
  canCreateGroup: boolean;
  /** Null before 00094, or when the feed could not be read: no row then. */
  stories: StoryAuthor[] | null;
  me: { id: string; name: string; avatarUrl: string | null };
  schoolId: string;
  channelsEnabled: boolean;
}) {
  const t = useTranslations("portal.messages");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [channelsOpen, setChannelsOpen] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeId = pathname.startsWith("/messages/") ? (pathname.split("/")[2] ?? null) : null;

  // A new message used to refresh the whole route from the server, for every
  // person who had the list open, on every message in any of their
  // conversations. That is one server render per reader per message — the
  // first thing to fall over when a class group gets busy. The row realtime
  // delivers already says everything the list shows, so it is laid over the
  // list here; the server is asked only about a conversation the list has
  // never seen.
  const [live, setLive] = useState<Record<string, Live>>({});
  // When this person last read each conversation, as realtime reported it —
  // here, in another tab or on the phone — so its count clears at once
  // instead of waiting for the list to be rendered again.
  const [readAt, setReadAt] = useState<Record<string, string>>({});
  // When the other side of a one-to-one last had it reach them, or read it.
  const [peer, setPeer] = useState<Record<string, { read: string | null; delivered: string | null }>>({});
  // The newest of one's own messages still on its way, by conversation
  // (outbox.ts): the row shows it, with its clock, until the server has it.
  const [waiting, setWaiting] = useState<Record<string, OutgoingRow>>({});

  // The list itself. The page brings one, but the page may be an older copy
  // kept on the device; so the list is also asked of the server directly —
  // as it opens, when the line or the app comes back, when realtime
  // reconnects, and every minute while it is on the screen — and that answer,
  // the newest there is, is what the list shows. It is kept on the device
  // (local-store.ts), so with no line the list is the last one seen, not the
  // page's older one. Realtime, messages on their way and messages sent from
  // here are laid over it, the newest of each winning.
  const [fresh, setFresh] = useState<ConversationSummary[] | null>(null);
  const [keptRows, setKeptRows] = useState<ConversationSummary[] | null>(null);
  const rows = useMemo(() => {
    if (fresh) return fresh;
    if (!keptRows) return conversations;
    const byId = new Map(conversations.map((c) => [c.id, c]));
    for (const k of keptRows) {
      const c = byId.get(k.id);
      if (!c || time(k.last_message_at ?? k.updated_at) > time(c.last_message_at ?? c.updated_at)) byId.set(k.id, k);
    }
    return [...byId.values()];
  }, [fresh, keptRows, conversations]);
  const listSeq = useRef(0);
  const refreshList = useCallback(async () => {
    const seq = ++listSeq.current;
    let answer: { data: unknown; error: unknown } = { data: null, error: true };
    try {
      answer = await getBrowserClient().rpc("list_my_conversations", { p_limit: 200 });
    } catch {
      return;
    }
    // An answer to an earlier question, overtaken by a later one, is let go.
    if (answer.error || !Array.isArray(answer.data) || seq !== listSeq.current) return;
    const next = answer.data as ConversationSummary[];
    setFresh(next);
    void keepList(currentUserId, next);
  }, [currentUserId]);
  useEffect(() => {
    let live = true;
    void keptList<ConversationSummary>(currentUserId).then((kept) => {
      if (live && kept) setKeptRows(kept.rows);
    });
    void refreshList();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshList();
    };
    const onOnline = () => void refreshList();
    const every = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void refreshList();
    }, 60_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      live = false;
      window.clearInterval(every);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [currentUserId, refreshList]);

  // Pins and deletions made here that the server may not have yet (list-ops.ts).
  const [ops, setOps] = useState<ListOp[]>([]);
  useEffect(() => {
    const look = () => setOps(pendingListOps(currentUserId));
    look();
    window.addEventListener(LIST_OPS_EVENT, look);
    return () => window.removeEventListener(LIST_OPS_EVENT, look);
  }, [currentUserId]);

  // The newest message this device knows of each conversation (local-store.ts):
  // one sent from here a moment ago, or read in its thread, is the row's last
  // message even before the server's list says so, and with no line at all.
  const [newestHere, setNewestHere] = useState<Record<string, ThreadMessage>>({});
  const idsKey = rows.map((c) => c.id).join(",");
  useEffect(() => {
    let live = true;
    const look = () =>
      void newestKept(currentUserId, idsKey ? idsKey.split(",") : []).then((newest) => {
        if (live) setNewestHere(newest);
      });
    look();
    window.addEventListener(OUTBOX_EVENT, look);
    return () => {
      live = false;
      window.removeEventListener(OUTBOX_EVENT, look);
    };
  }, [currentUserId, idsKey]);

  const known = useRef(new Set<string>());
  const active = useRef<string | null>(null);
  const rowsRef = useRef(rows);
  const seenCleared = useRef(new Map<string, number>());
  useEffect(() => {
    known.current = new Set(rows.map((c) => c.id));
    active.current = activeId;
    rowsRef.current = rows;
  }, [rows, activeId]);

  // Realtime checks every change against every subscriber, so the list asks
  // only about its own conversations — up to the hundred a filter can name —
  // and hears about a new one from its own membership row instead of from
  // every message sent anywhere in the school. The ticks are followed live
  // for one-to-ones only: in a group the mark is the last of everybody to
  // catch up, which one row cannot say, and the thread follows it there.
  // Deleted chats are listened to as well: a new message in one brings it back.
  const [cleared, setCleared] = useState<Cleared[]>([]);
  // Up to when each was deleted, kept after it comes back: an older copy of
  // the list (the page kept on the phone) cannot show it again with what was deleted.
  const [cutoffs, setCutoffs] = useState<Record<string, number>>({});
  const clearedIds = useRef(new Set<string>());
  useEffect(() => {
    const look = () => {
      const chats = clearedChats(currentUserId);
      clearedIds.current = new Set(chats.map((chat) => chat.id));
      setCleared(chats);
      setCutoffs(clearedCutoffs(currentUserId));
    };
    look();
    window.addEventListener(LIST_OPS_EVENT, look);
    return () => window.removeEventListener(LIST_OPS_EVENT, look);
  }, [currentUserId]);
  // Back in the server's list with something said after it was deleted: no longer a deleted chat.
  useEffect(() => {
    if (!fresh || cleared.length === 0) return;
    const said = new Map(fresh.map((c) => [c.id, c.last_message_at ? time(c.last_message_at) : 0]));
    const still = cleared.filter((chat) => (said.get(chat.id) ?? 0) <= time(chat.at));
    if (still.length !== cleared.length) {
      setClearedChats(currentUserId, still);
      window.dispatchEvent(new Event(LIST_OPS_EVENT));
    }
  }, [fresh, cleared, currentUserId]);
  const clearedKey = cleared.map((chat) => chat.id).join(",");
  const idFilter = useMemo(() => {
    const ids = [...new Set([...(idsKey ? idsKey.split(",") : []), ...(clearedKey ? clearedKey.split(",") : [])])];
    return ids.length > 0 && ids.length <= 100 ? `conversation_id=in.(${ids.join(",")})` : null;
  }, [idsKey, clearedKey]);
  const directKey = rows
    .filter((c) => c.type === "direct")
    .map((c) => c.id)
    .join(",");
  const directFilter = useMemo(() => {
    const ids = directKey ? directKey.split(",") : [];
    return ids.length > 0 && ids.length <= 100 ? `conversation_id=in.(${ids.join(",")})` : null;
  }, [directKey]);

  // A burst of messages renews a conversation once, after it settles.
  const renewTimers = useRef(new Map<string, number>());
  const renewSoon = useCallback((conversationId: string) => {
    const timers = renewTimers.current;
    window.clearTimeout(timers.get(conversationId));
    timers.set(
      conversationId,
      window.setTimeout(() => {
        timers.delete(conversationId);
        renewKeptPage(`/messages/${conversationId}`);
      }, 2500)
    );
  }, []);

  useEffect(() => {
    const supabase = getBrowserClient();
    let channel = supabase
      .channel(`conversation-list:${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_members", filter: `user_id=eq.${currentUserId}` },
        () => {
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => void refreshList(), 400);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation_members", filter: `user_id=eq.${currentUserId}` },
        (payload) => {
          const row = payload.new as { conversation_id: string; last_read_at: string | null; pinned_at?: string | null; cleared_at?: string | null; is_muted?: boolean };
          // Pinned, deleted or muted — here or on another of this person's
          // devices: the list is asked for again (realtime sends only the new row).
          const was = rowsRef.current.find((c) => c.id === row.conversation_id);
          const cleared = row.cleared_at ? time(row.cleared_at) : 0;
          const repinned = row.pinned_at !== undefined && time(row.pinned_at ?? "") !== time(was?.pinned_at ?? "");
          const remuted = row.is_muted !== undefined && was !== undefined && was.is_muted !== row.is_muted;
          const recleared = cleared > 0 && seenCleared.current.get(row.conversation_id) !== cleared;
          if (recleared) seenCleared.current.set(row.conversation_id, cleared);
          if (repinned || remuted || recleared) {
            if (refreshTimer.current) clearTimeout(refreshTimer.current);
            refreshTimer.current = setTimeout(() => void refreshList(), 300);
          }
          const at = row.last_read_at;
          if (!at) return;
          setReadAt((current) => (current[row.conversation_id] === at ? current : { ...current, [row.conversation_id]: at }));
          // What arrived before the read is read; what arrives after counts again.
          setLive((current) => {
            const l = current[row.conversation_id];
            return l && l.unread > 0 && time(l.created_at) <= time(at) ? { ...current, [row.conversation_id]: { ...l, unread: 0 } } : current;
          });
        }
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", ...(idFilter ? { filter: idFilter } : {}) }, (payload) => {
        const row = payload.new as { conversation_id: string; content: string; sender_id: string | null; created_at: string; type: string };
        // New to the list, or deleted here and back with this: the server's
        // list is asked for (an older copy of it may still hold the row).
        if (!known.current.has(row.conversation_id) || clearedIds.current.has(row.conversation_id)) {
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => void refreshList(), 700);
          return;
        }
        const counts = row.sender_id !== currentUserId && row.conversation_id !== active.current;
        // What the phone keeps of that conversation takes the message too, so
        // it opens with it — even later, with no line (public/sw.js).
        renewSoon(row.conversation_id);
        setLive((current) => ({
          ...current,
          [row.conversation_id]: {
            content: row.content,
            sender_id: row.sender_id,
            created_at: row.created_at,
            type: row.type,
            unread: (current[row.conversation_id]?.unread ?? 0) + (counts ? 1 : 0),
          },
        }));
      });
    if (directFilter) {
      channel = channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members", filter: directFilter }, (payload) => {
        const row = payload.new as { conversation_id: string; user_id: string; last_read_at: string | null; last_delivered_at?: string | null };
        if (row.user_id === currentUserId) return;
        setPeer((current) => {
          const was = current[row.conversation_id];
          const read = later(was?.read, row.last_read_at);
          const delivered = later(was?.delivered, row.last_delivered_at ?? null);
          return was && was.read === read && was.delivered === delivered ? current : { ...current, [row.conversation_id]: { read, delivered } };
        });
      });
    }
    // On (again): what happened meanwhile is in the server's list.
    listen(channel, (status) => {
      if (status === "SUBSCRIBED") void refreshList();
    });
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, idFilter, directFilter, renewSoon, refreshList]);

  // Read on this device (thread.tsx): cleared here at once, whatever the
  // line — the server's own word comes through realtime when it can.
  useEffect(() => {
    const onRead = (event: Event) => {
      const { conversationId, at } = (event as CustomEvent<{ conversationId: string; at: string }>).detail;
      setReadAt((current) => ({ ...current, [conversationId]: at }));
      setLive((current) => {
        const l = current[conversationId];
        return l && l.unread > 0 ? { ...current, [conversationId]: { ...l, unread: 0 } } : current;
      });
    };
    window.addEventListener(READ_EVENT, onRead);
    return () => window.removeEventListener(READ_EVENT, onRead);
  }, []);

  // Sent from here, or still on its way: the row says so at once, whatever
  // the line — a clock while it waits, a tick the moment the server has it.
  useEffect(() => {
    const look = () => {
      const newest: Record<string, OutgoingRow> = {};
      for (const row of waitingRows()) {
        if (row.sender_id !== currentUserId || !row.created_at) continue;
        const was = newest[row.conversation_id];
        if (!was || time(row.created_at) >= time(was.created_at!)) newest[row.conversation_id] = row;
      }
      setWaiting(newest);
    };
    const onChange = (event: Event) => {
      const sent = (event as CustomEvent<{ sent?: OutgoingRow }>).detail?.sent;
      if (sent && sent.sender_id === currentUserId) {
        // The server has it now: one tick, until realtime brings the row itself.
        const at = new Date().toISOString();
        setLive((current) => {
          const was = current[sent.conversation_id];
          if (was && time(was.created_at) > time(at)) return current;
          return {
            ...current,
            [sent.conversation_id]: { content: sent.content, sender_id: currentUserId, created_at: at, type: sent.type, unread: was?.unread ?? 0 },
          };
        });
      }
      look();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === OUTBOX_KEY) look();
    };
    look();
    window.addEventListener(OUTBOX_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(OUTBOX_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [currentUserId]);

  const today = dayKey(new Date(), timeZone);
  const merged = useMemo(() => {
    // Pins and deletions made here, before the server has said so.
    const pins = new Map<string, string | null>();
    const cleared = new Map<string, number>();
    for (const op of ops) {
      if (op.kind === "clear") {
        cleared.set(op.conversationId, Math.max(cleared.get(op.conversationId) ?? 0, time(op.at)));
        pins.set(op.conversationId, null);
      } else pins.set(op.conversationId, op.kind === "pin" ? op.at : null);
    }
    const result = [];
    for (const c of rows) {
      const l = live[c.id];
      const read = readAt[c.id];
      // Read since the server counted: everything it counted is read.
      const counted = read !== undefined && (!c.last_message_at || time(c.last_message_at) <= time(read)) ? 0 : c.unread_count;
      const p = peer[c.id];
      let row: ConversationSummary =
        l && (!c.last_message_at || time(l.created_at) > time(c.last_message_at))
          ? {
              ...c,
              last_message_content: l.content,
              last_message_sender_id: l.sender_id,
              last_message_at: l.created_at,
              last_message_deleted: false,
              last_message_type: l.type,
              unread_count: counted + l.unread,
            }
          : { ...c, unread_count: counted };
      // A newer message this device has (sent from here, or seen in its
      // thread) than the list's: the row says it, not an older one.
      const h = newestHere[c.id];
      if (h && !h.is_deleted && (!row.last_message_at || time(h.created_at) > time(row.last_message_at))) {
        row = {
          ...row,
          last_message_content: h.content,
          last_message_sender_id: h.sender_id,
          last_message_at: h.created_at,
          last_message_deleted: false,
          last_message_type: h.type,
        };
      }
      if (p) {
        row.peer_read_at = later(row.peer_read_at, p.read);
        row.peer_delivered_at = later(row.peer_delivered_at, p.delivered);
      }
      // Still on its way: the last thing said here is what was just written,
      // and the row goes to the top with it — by this phone's clock or the
      // server's, whichever is later, so a clock set a little behind cannot
      // leave it lower down.
      const w = waiting[c.id];
      const sortAt = Math.max(time(row.last_message_at ?? row.updated_at), w?.created_at ? time(w.created_at) : 0);
      if (w?.created_at) {
        row = {
          ...row,
          last_message_content: w.content,
          last_message_sender_id: currentUserId,
          last_message_at: w.created_at,
          last_message_deleted: false,
          last_message_type: w.type,
        };
      }
      // Deleted here: gone from the list until something newer is said.
      const clearedAt = Math.max(cleared.get(c.id) ?? 0, cutoffs[c.id] ?? 0);
      if (clearedAt > 0 && (!row.last_message_at || time(row.last_message_at) <= clearedAt)) continue;
      if (pins.has(c.id)) row.pinned_at = pins.get(c.id) ?? null;
      const askedByMe = c.type === "support" && c.created_by === currentUserId;
      const title = askedByMe ? t("supportTitle") : conversationTitle(row, currentUserId, t("unknownUser"));
      result.push({ ...row, title, askedByMe, waiting: Boolean(w?.created_at && !w.failed), failedHere: Boolean(w?.failed), sortAt });
    }
    return result;
  }, [rows, live, readAt, peer, waiting, newestHere, ops, cutoffs, currentUserId, t]);

  // ------------------------------------------------- press and hold a chat

  const toast = useToast();
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const press = useRef<{ id: string; x: number; y: number; timer: number; held: boolean } | null>(null);
  // Lifting the finger after a long press "clicks" whatever is under it then —
  // the sheet that has just opened there. Only a tap begun on the sheet acts.
  const pressedOnSheet = useRef(false);
  const openActions = useCallback((id: string) => {
    pressedOnSheet.current = false;
    setConfirmDelete(false);
    setActionsFor(id);
  }, []);
  const sheetGuard = {
    onPointerDownCapture: () => {
      pressedOnSheet.current = true;
    },
    onClickCapture: (event: React.MouseEvent) => {
      // detail 0: the keyboard or a screen reader, never the lift.
      if (event.detail > 0 && !pressedOnSheet.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
  const pressHandlers = (id: string) => ({
    onPointerDown: (event: React.PointerEvent<HTMLAnchorElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const anchor = event.currentTarget;
      if (press.current) window.clearTimeout(press.current.timer);
      const started = {
        id,
        x: event.clientX,
        y: event.clientY,
        held: false,
        timer: window.setTimeout(() => {
          started.held = true;
          // The messenger's own tap handling and the link both leave it alone (messages-frame.tsx).
          anchor.dataset.held = "1";
          navigator.vibrate?.(12);
          openActions(id);
        }, 480),
      };
      press.current = started;
    },
    onPointerMove: (event: React.PointerEvent<HTMLAnchorElement>) => {
      const held = press.current;
      if (!held || held.held) return;
      if (Math.abs(event.clientX - held.x) > 10 || Math.abs(event.clientY - held.y) > 10) {
        window.clearTimeout(held.timer);
        press.current = null;
      }
    },
    onPointerUp: () => {
      if (press.current && !press.current.held) {
        window.clearTimeout(press.current.timer);
        press.current = null;
      }
    },
    onPointerCancel: () => {
      if (press.current) window.clearTimeout(press.current.timer);
      press.current = null;
    },
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      // The lift after a long press opens nothing.
      if (event.currentTarget.dataset.held) {
        event.preventDefault();
        delete event.currentTarget.dataset.held;
        press.current = null;
      }
    },
    onContextMenu: (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      event.currentTarget.dataset.held = "1";
      openActions(id);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLAnchorElement>) => {
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        openActions(id);
      }
    },
  });
  // The lift after a long press ends on the sheet, not on the row: let the row go.
  useEffect(() => {
    if (actionsFor) return;
    for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>("a.msg-row[data-held]"))) delete anchor.dataset.held;
  }, [actionsFor]);

  const acting = merged.find((c) => c.id === actionsFor) ?? null;
  // A server without 00098's list (pinned_at) would forget a pin at once: offered only where it holds.
  const canPin = rows.length === 0 || rows.some((c) => "pinned_at" in c);
  const togglePin = () => {
    if (!acting) return;
    const pinned = Boolean(acting.pinned_at);
    queueListOp({ userId: currentUserId, conversationId: acting.id, kind: pinned ? "unpin" : "pin", at: new Date().toISOString() });
    setActionsFor(null);
    toast("success", t(pinned ? "chatActions.unpinnedToast" : "chatActions.pinnedToast"));
    window.setTimeout(() => void refreshList(), 1200);
  };
  const toggleMute = () => {
    if (!acting) return;
    const muted = acting.is_muted;
    setActionsFor(null);
    void setMutedAction(acting.id, !muted).then((result) => {
      toast(result.ok ? "success" : "danger", result.ok ? t(muted ? "unmutedToast" : "mutedToast") : t("chatActions.title"));
      if (result.ok) void refreshList();
    });
  };
  const deleteChat = () => {
    if (!acting) return;
    // Everything on the screen goes, even if this phone's clock is behind the server's.
    const at = new Date(Math.max(Date.now(), acting.last_message_at ? time(acting.last_message_at) : 0)).toISOString();
    setClearedUpTo(currentUserId, acting.id, at);
    queueListOp({ userId: currentUserId, conversationId: acting.id, kind: "clear", at });
    setClearedChats(currentUserId, [...clearedChats(currentUserId).filter((chat) => chat.id !== acting.id), { id: acting.id, at }]);
    void forgetConversation(currentUserId, acting.id, time(at));
    setActionsFor(null);
    setConfirmDelete(false);
    toast("success", t("chatActions.deletedToast"));
    if (activeId === acting.id) router.push("/messages");
    window.setTimeout(() => void refreshList(), 1200);
  };

  const unreadCount = merged.filter((c) => c.unread_count > 0 && c.id !== activeId).length;
  // The conversations at the top are fetched ahead, whole, so a tap opens
  // them at once from the device (warm-pages.ts) — the newest first.
  const warmHrefs = merged
    .filter((c) => !c.askedByMe)
    .slice(0, 6)
    .map((c) => `/messages/${c.id}`)
    .join("|");
  useEffect(() => {
    let live = true;
    const list = warmHrefs.split("|").filter(Boolean);
    let index = 0;
    let timer = 0;
    const next = () => {
      if (!live || index >= list.length) return;
      warmPage(router, list[index++]!, () => live);
      timer = window.setTimeout(next, 500);
    };
    const begin = window.setTimeout(next, 1200);
    return () => {
      live = false;
      window.clearTimeout(begin);
      window.clearTimeout(timer);
    };
  }, [warmHrefs, router]);

  // The bar's badge adds up what this list does (app-shell.tsx), so it is
  // right the moment a conversation is read, online or not.
  const unreadTotal = merged.reduce((sum, c) => (c.is_muted || c.id === activeId ? sum : sum + c.unread_count), 0);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(UNREAD_TOTAL_EVENT, { detail: unreadTotal }));
  }, [unreadTotal]);
  const hasChannels = merged.some((c) => c.type === "channel");
  const items = useMemo(() => {
    const normalized = fold(query.trim());
    return merged
      .filter((c) => !normalized || fold(c.title).includes(normalized))
      .filter((c) =>
        filter === "unread"
          ? c.unread_count > 0 && c.id !== activeId
          : filter === "groups"
            ? c.type === "group" || c.type === "class_group" || c.type === "announcement"
            : filter === "channels"
              ? c.type === "channel"
              : true
      )
      // Pinned first, the last pinned at the top; then the newest.
      .sort((a, b) => {
        const pa = a.pinned_at ? time(a.pinned_at) : 0;
        const pb = b.pinned_at ? time(b.pinned_at) : 0;
        return pb - pa || b.sortAt - a.sortAt;
      });
  }, [merged, query, filter, activeId]);

  const chips: Array<{ key: Filter; label: string }> = [
    { key: "all", label: t("filters.all") },
    { key: "unread", label: unreadCount > 0 ? `${t("filters.unread")} ${unreadCount}` : t("filters.unread") },
    { key: "groups", label: t("filters.groups") },
    ...(channelsEnabled || hasChannels ? [{ key: "channels" as const, label: t("filters.channels") }] : []),
  ];

  return (
    <div className="msg-pane">
      <div className="msg-head">
        <h1 className="msg-title">{t("title")}</h1>
        {channelsEnabled ? (
          <button type="button" className="msg-head-icon" onClick={() => setChannelsOpen(true)} aria-label={t("channel.title")} title={t("channel.title")}>
            <Megaphone className="size-5" strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="msg-search">
        <Search className="msg-search-icon" aria-hidden />
        <label htmlFor="conversation-filter" className="sr-only">
          {t("filter")}
        </label>
        <input
          id="conversation-filter"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("filter")}
          className="msg-search-input"
          enterKeyHint="search"
        />
        {query ? (
          <button type="button" className="msg-search-clear" onClick={() => setQuery("")} aria-label={t("clearSearch")}>
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="msg-scroll">
        {stories && !query ? <StoriesRow feed={stories} me={me} schoolId={schoolId} /> : null}

        <div className="msg-chips" role="tablist" aria-label={t("filters.label")} data-swipe="own">
          {chips.map((chip) => (
            <button key={chip.key} type="button" role="tab" aria-selected={filter === chip.key} className="msg-chip" onClick={() => setFilter(chip.key)}>
              {chip.label}
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="msg-empty">
            <p>
              {rows.length === 0
                ? t("noConversations")
                : query
                  ? t("noMatches")
                  : filter === "unread"
                    ? t("filters.noUnread")
                    : filter === "channels"
                      ? t("filters.noChannels")
                      : filter === "groups"
                        ? t("filters.noGroups")
                        : t("noMatches")}
            </p>
            {filter === "channels" && channelsEnabled ? (
              <button type="button" className="msg-pill-button mt-3" onClick={() => setChannelsOpen(true)}>
                {t("channel.find")}
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="msg-list">
            {items.map((c) => {
              const isActive = c.id === activeId;
              const unread = !isActive && c.unread_count > 0;
              const other = c.type === "direct" ? c.members?.find((m) => m.user_id !== currentUserId) : null;
              const broadcast = isBroadcast(c.type);
              const mine = Boolean(c.last_message_at) && c.last_message_sender_id === currentUserId && !c.last_message_deleted;
              const sender =
                !mine && !broadcast && c.type !== "direct" && c.last_message_sender_id
                  ? c.members?.find((m) => m.user_id === c.last_message_sender_id)?.first_name ?? null
                  : null;
              const body = c.last_message_at
                ? c.last_message_deleted
                  ? t("deletedMessage")
                  : c.last_message_type === "location"
                    ? `📍 ${c.last_message_content || t("locationShort")}`
                    : c.last_message_type === "image"
                      ? c.last_message_content ? `📷 ${c.last_message_content}` : `📷 ${t("photo")}`
                      : c.last_message_type === "file"
                        ? `📎 ${c.last_message_content || t("fileShort")}`
                        : c.last_message_type === "audio"
                          ? `🎤 ${t("voice")}`
                          : c.last_message_content ?? ""
                : c.type === "channel" && c.description
                  ? c.description
                  : t("noMessagesYet");
              const when = c.last_message_at
                ? dayKey(c.last_message_at, timeZone) === today
                  ? formatClock(c.last_message_at, locale, timeZone)
                  : formatShortDate(c.last_message_at, locale, timeZone)
                : "";
              const ticks = c.waiting
                ? ("sending" as const)
                : mine && !broadcast && c.last_message_at
                  ? tickState(
                      c.last_message_at,
                      c.peer_delivered_at ? time(c.peer_delivered_at) : null,
                      c.peer_read_at ? time(c.peer_read_at) : null
                    )
                  : null;
              return (
                <li key={c.id}>
                  <Link
                    href={c.askedByMe ? "/support/chat" : `/messages/${c.id}`}
                    aria-current={isActive ? "page" : undefined}
                    className="msg-row"
                    data-unread={unread || undefined}
                    data-pinned={c.pinned_at ? "" : undefined}
                    aria-keyshortcuts="Shift+F10"
                    {...pressHandlers(c.id)}
                    // What the thread shows at once while its messages come (messages-frame.tsx).
                    data-title={c.title}
                    data-kind={c.type === "direct" || c.type === "channel" || c.type === "support" ? c.type : "group"}
                    data-avatar={c.type === "direct" ? (other?.avatar_url ?? "") : ""}
                  >
                    {c.type === "support" ? (
                      <span className="msg-avatar msg-avatar-support" aria-hidden>
                        <Headset className="size-5" />
                      </span>
                    ) : c.type === "direct" ? (
                      <Avatar name={c.title} src={other?.avatar_url} ring={false} className="size-12 text-base" />
                    ) : c.type === "channel" ? (
                      <span className="msg-avatar msg-avatar-channel" aria-hidden>
                        <Megaphone className="size-5" strokeWidth={1.75} />
                      </span>
                    ) : (
                      <span className="msg-avatar msg-avatar-group" aria-hidden>
                        <Users className="size-5" strokeWidth={1.75} />
                      </span>
                    )}
                    <span className="msg-body">
                      <span className="msg-line">
                        <span className="msg-name">
                          <span className="truncate">{c.title}</span>
                          {c.type === "support" && !c.askedByMe ? <span className="msg-tag">{t("supportBadge")}</span> : null}
                          {c.pinned_at ? <Pin className="msg-pin" aria-label={t("chatActions.pinnedMark")} /> : null}
                        </span>
                        <time className="msg-time" dateTime={c.last_message_at ?? undefined}>
                          {when}
                        </time>
                      </span>
                      <span className="msg-line">
                        <span className="msg-preview">
                          {c.failedHere ? (
                            <AlertCircle className="msg-failed" aria-label={t("receipt.failed")} />
                          ) : ticks ? (
                            <Ticks
                              state={ticks}
                              label={
                                ticks === "sending"
                                  ? t("receipt.sending")
                                  : ticks === "read"
                                    ? t("receipt.seen")
                                    : ticks === "delivered"
                                      ? t("receipt.delivered")
                                      : t("receipt.sent")
                              }
                              className="msg-ticks"
                            />
                          ) : null}
                          {sender ? <span className="msg-sender">{sender}: </span> : null}
                          <span className="truncate">{body}</span>
                        </span>
                        {c.is_muted ? <BellOff className="msg-muted" aria-label={t("muted")} /> : null}
                        {unread ? (
                          <span className={cn("msg-badge", c.is_muted && "msg-badge-muted")}>
                            <span aria-hidden>{c.unread_count > 99 ? "99+" : c.unread_count}</span>
                            <span className="sr-only">{t("unread", { count: c.unread_count })}</span>
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Overlay.Dialog open={Boolean(acting)} onOpenChange={(open) => (open ? null : setActionsFor(null))}>
        {acting ? (
          <Overlay.DialogContent
            title={confirmDelete ? t("chatActions.deleteTitle") : acting.title}
            description={confirmDelete ? t("chatActions.deleteText") : t("chatActions.title")}
            closeLabel={t("chatActions.cancel")}
            size="sm"
          >
            {confirmDelete ? (
              <div className="flex justify-end gap-2" {...sheetGuard}>
                <button type="button" className="msg-sheet-button" onClick={() => setConfirmDelete(false)}>
                  {t("chatActions.cancel")}
                </button>
                <button type="button" className="msg-sheet-button msg-sheet-danger" onClick={deleteChat} autoFocus>
                  <Trash2 className="size-4" aria-hidden />
                  {t("chatActions.deleteConfirm")}
                </button>
              </div>
            ) : (
              <ul className="msg-sheet" role="menu" aria-label={t("chatActions.title")} {...sheetGuard}>
                {canPin ? (
                  <li>
                    <button type="button" role="menuitem" className="msg-sheet-item" onClick={togglePin} autoFocus>
                      {acting.pinned_at ? <PinOff aria-hidden /> : <Pin aria-hidden />}
                      {acting.pinned_at ? t("chatActions.unpin") : t("chatActions.pin")}
                    </button>
                  </li>
                ) : null}
                <li>
                  <button type="button" role="menuitem" className="msg-sheet-item" onClick={toggleMute} autoFocus={!canPin}>
                    {acting.is_muted ? <Bell aria-hidden /> : <BellOff aria-hidden />}
                    {acting.is_muted ? t("chatActions.unmute") : t("chatActions.mute")}
                  </button>
                </li>
                <li>
                  <button type="button" role="menuitem" className="msg-sheet-item msg-sheet-danger" onClick={() => setConfirmDelete(true)}>
                    <Trash2 aria-hidden />
                    {t("chatActions.delete")}
                  </button>
                </li>
              </ul>
            )}
          </Overlay.DialogContent>
        ) : null}
      </Overlay.Dialog>

      <NewConversationButton canCreateGroup={canCreateGroup} variant="fab" />
      {channelsEnabled ? <ChannelsDialog open={channelsOpen} onOpenChange={setChannelsOpen} canCreate={canCreateGroup} /> : null}
    </div>
  );
}
