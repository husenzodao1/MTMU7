"use client";

import {
  ArrowLeft,
  Ban,
  Bell,
  BellOff,
  Camera,
  Check,
  ChevronDown,
  Copy,
  CornerUpLeft,
  Download,
  EllipsisVertical,
  FileText,
  Flag,
  Headset,
  ImagePlus,
  LoaderCircle,
  LogOut,
  MapPin,
  Maximize2,
  Megaphone,
  Mic,
  Minimize2,
  Palette,
  ALargeSmall,
  Paperclip,
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
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Button, buttonClasses } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/form-controls";
import { Avatar } from "@/components/ui/misc";
import * as Overlay from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import {
  closeChannelAction,
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
import { FileCard, MessageText, ReactionBar, ReactionsPill, VoiceNote } from "@/features/messages/bubbles";
import { checkFile, FILE_ACCEPT, formatBytes, formatDuration, kindOf } from "@/features/messages/files";
import { DRAFT_PREFIX } from "@/features/messages/forget";
import { LIST_OPS_EVENT, clearedUpTo } from "@/features/messages/list-ops";
import { forgetConversation, forgetMessages, keepMessages, keepPhoto, keepRun, keptMessages, keptPhoto, type KeptRun } from "@/features/messages/local-store";
import { keptMarks, laterMark, rememberMarks } from "@/features/messages/read-marks";
import { markReadUpTo } from "@/features/messages/read-queue";
import { MessageGestures } from "@/features/messages/gestures";
import {
  claimSending,
  dropOutgoing,
  failOutgoing,
  keepOutgoing,
  outgoingBytes,
  outgoingFor,
  releaseSending,
  sendRow,
  settled,
  waitForLine,
  waitingRows,
  type OutgoingRow,
} from "@/features/messages/outbox";
import { GroupMembersDialog } from "@/features/messages/group-members";
import { downloadLink, mediaPath, prepareImage, removeMedia, uploadMedia, useSignedUrl, type PreparedImage } from "@/features/messages/media";
import { LocationCard, locate } from "@/features/messages/location";
import { MemberCardDialog, type MemberCardSeed } from "@/features/messages/member-card";
import { Ticks, tickState } from "@/features/messages/ticks";
import { PhotoViewer, type ViewedPhoto } from "@/features/messages/photo-viewer";
import { canRecord, useVoiceRecorder, type Recording } from "@/features/messages/recorder";
import { TextSizeDialog, useChatTextSize } from "@/features/messages/text-size";
import { useWallpaper, WallpaperDialog, WALLPAPERS, type Wallpaper } from "@/features/messages/wallpaper";
import { dbErrorKey } from "@/lib/actions/db-error-key";
import { EDIT_WINDOW_MS, isBroadcast, MESSAGE_MAX_LENGTH, REPORT_REASONS, type ConversationMember, type Reaction, type ThreadMessage } from "@/features/messages/types";
import { dayKey, formatClock, formatDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { getBrowserClient, listen } from "@/lib/supabase/browser";
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
  /** When the other side of a one-to-one last had the portal open. */
  lastSeenAt?: string | null;
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
  media_path: string | null;
  media_width: number | null;
  media_height: number | null;
  media_name: string | null;
  media_size: number | null;
  media_mime: string | null;
  media_duration: number | null;
}

/** What is waiting above the composer to be sent: a photo, or any other file. */
type Attachment =
  | { kind: "photo"; image: PreparedImage }
  | { kind: "file"; file: File; name: string; mime: string; size: number; extension: string };

/** Everything that goes when a message is deleted for everyone. */
const EMPTIED = {
  location_lat: null,
  location_lng: null,
  media_path: null,
  media_width: null,
  media_height: null,
  media_name: null,
  media_size: null,
  media_mime: null,
  media_duration: null,
  local_preview: undefined,
  reactions: [],
} satisfies Partial<ThreadMessage>;

const at = (value: string) => Date.parse(value) || 0;

/** Oldest first, by the moment the server took each message (one still on its way: when it was written). */
function sortAsc(list: ThreadMessage[]): ThreadMessage[] {
  return [...list].sort((a, b) => at(a.created_at) - at(b.created_at) || a.id.localeCompare(b.id));
}

/** Not yet the server's: on its way from here, or refused. */
const isLocal = (m: ThreadMessage) => m.id.startsWith("local:") || Boolean(m.pending) || Boolean(m.failed);

/** The copy on the screen says more than the incoming one: deleted, or edited later. */
function saysMore(was: ThreadMessage, incoming: ThreadMessage): boolean {
  if (was.is_deleted && !incoming.is_deleted) return true;
  return Boolean(was.edited_at && (!incoming.edited_at || at(was.edited_at) > at(incoming.edited_at)));
}

/**
 * The server's copies laid over what is on the screen, by id. Nothing is
 * taken away because an answer does not have it — an answer may be older
 * than a message just sent — and nothing newer is replaced by something
 * older. A message still showing as on its way from here gives way to the
 * server's copy of itself (the same id, made here).
 */
function mergeServer(current: ThreadMessage[], incoming: ThreadMessage[]): ThreadMessage[] {
  if (incoming.length === 0) return current;
  const byId = new Map(current.map((m) => [m.id, m]));
  let changed = false;
  for (const row of incoming) {
    const local = byId.get(`local:${row.id}`);
    if (local) {
      byId.delete(`local:${row.id}`);
      byId.set(row.id, { ...row, local_preview: local.local_preview });
      changed = true;
      continue;
    }
    const was = byId.get(row.id);
    if (was && saysMore(was, row)) continue;
    byId.set(row.id, was ? { ...was, ...row, local_preview: was.local_preview } : row);
    changed = true;
  }
  return changed ? sortAsc([...byId.values()]) : current;
}

/** From the oldest to the newest of the server's messages in a list, or nothing. */
function spanOf(list: ThreadMessage[]): KeptRun | null {
  const times = list.filter((m) => !isLocal(m)).map((m) => at(m.created_at));
  return times.length > 0 ? { from: Math.min(...times), to: Math.max(...times) } : null;
}

/** What was kept on the device, for whatever the screen does not have yet. */
function mergeMissing(current: ThreadMessage[], kept: ThreadMessage[]): ThreadMessage[] {
  const have = new Set(current.map((m) => m.id));
  const missing = kept.filter((m) => !have.has(m.id) && !have.has(`local:${m.id}`));
  return missing.length > 0 ? sortAsc([...current, ...missing]) : current;
}

function withReaction(message: ThreadMessage, userId: string, emoji: string | null): ThreadMessage {
  const others = (message.reactions ?? []).filter((r) => r.user_id !== userId);
  return { ...message, reactions: emoji ? [...others, { user_id: userId, emoji }] : others };
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// Whether this browser can record is known only in the browser; the server's
// answer is "no", so the first paint matches it and the microphone appears after.
const noSubscription = () => () => undefined;
const cannotRecordOnServer = () => false;

export function Thread({
  conversation,
  members: initialMembers,
  myRole,
  currentUserId,
  initialMessages,
  clearedAt = null,
  initialPinned,
  blockedUserIds,
  canPost,
  canManageMembers,
  canMessage,
  timeZone,
  schoolId,
}: {
  conversation: ThreadConversation;
  members: ConversationMember[];
  myRole: "admin" | "member";
  currentUserId: string;
  initialMessages: ThreadMessage[];
  /** When this person deleted the conversation for themselves, if they did. */
  clearedAt?: string | null;
  initialPinned: Array<Pick<ThreadMessage, "id" | "content" | "sender_first_name" | "sender_last_name">>;
  blockedUserIds: string[];
  canPost: boolean;
  canManageMembers: boolean;
  /** May start a new conversation from somebody's card. */
  canMessage: boolean;
  timeZone: string;
  schoolId: string;
}) {
  const t = useTranslations("portal.messages");
  const tRoot = useTranslations();
  const locale = useLocale() as Locale;
  const toast = useToast();
  const router = useRouter();

  const [allMessages, setMessages] = useState<ThreadMessage[]>(() => sortAsc(initialMessages));
  // Deleted for oneself (the list's long press, here or on another device):
  // nothing from before it is shown, whatever an older copy of the page, or
  // what the device kept, still holds.
  const [hiddenUpTo, setHiddenUpTo] = useState(() => (clearedAt ? at(clearedAt) : 0));
  const hideUpTo = useCallback((moment: number) => setHiddenUpTo((was) => Math.max(was, moment)), []);
  useEffect(() => {
    const look = () => hideUpTo(clearedUpTo(currentUserId, conversation.id));
    look();
    window.addEventListener(LIST_OPS_EVENT, look);
    return () => window.removeEventListener(LIST_OPS_EVENT, look);
  }, [currentUserId, conversation.id, hideUpTo]);
  useEffect(() => {
    if (hiddenUpTo > 0) void forgetConversation(currentUserId, conversation.id, hiddenUpTo);
  }, [hiddenUpTo, currentUserId, conversation.id]);
  const messages = useMemo(
    () => (hiddenUpTo > 0 ? allMessages.filter((m) => isLocal(m) || at(m.created_at) > hiddenUpTo) : allMessages),
    [allMessages, hiddenUpTo]
  );
  // The stretch of the conversation, by time, on the screen with nothing
  // missing in it: the page's (all it had, newest first, when it was made),
  // widened by what the device kept whole, catch-ups and older pages.
  // Messages newer than it (realtime's, one's own, kept from the outbox) are
  // shown, and the next catch-up makes sure of what lies before them.
  const span = useRef<KeptRun | null>(spanOf(initialMessages));
  const [hasMore, setHasMore] = useState(initialMessages.length >= 50);
  const [pinned, setPinned] = useState(initialPinned);
  const [replyTo, setReplyTo] = useState<ThreadMessage | null>(null);
  const [editing, setEditing] = useState<ThreadMessage | null>(null);
  const [reporting, setReporting] = useState<ThreadMessage | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [wallpaper] = useWallpaper();
  const [textSizeOpen, setTextSizeOpen] = useState(false);
  useChatTextSize();
  // The message whose menu is open: from its button, a long press or a right-click.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // The message a tap on a quote has just brought into view, lit for a moment.
  const [flash, setFlash] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [typingNow, setTypingNow] = useState<Record<string, { kind: "typing" | "recording"; until: number }>>({});
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
  // What is being typed lives outside React state: a keystroke used to render
  // the whole conversation again, every bubble of it, and on a phone the send
  // button trailed the first letter by a visible moment. Now it renders the
  // one button that depends on it (ComposerAction) and nothing else.
  const draft = useDraft(inputRef, `${DRAFT_PREFIX}${currentUserId}:${conversation.id}`);
  // The words kept from before into the box, once it is there.
  useEffect(() => {
    const box = inputRef.current;
    const text = draft.get();
    if (box && text && !box.value) box.value = text;
  }, [draft]);
  useKeyboardSync(inputRef, draft);
  const preserveScroll = useRef<number | null>(null);
  const stickToBottom = useRef(true);
  const farFromBottom = useRef(false);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  /**
   * Read up to the newest message of the server's that is on the screen —
   * not the newest there is: scrolled up to read earlier ones, what came
   * after stays unread, as does anything that arrived and was never drawn.
   * Only with the app on the screen.
   */
  const readTimer = useRef(0);
  const readSoon = useCallback(() => {
    window.clearTimeout(readTimer.current);
    readTimer.current = window.setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      const box = scrollRef.current;
      if (!box) return;
      const bottom = box.getBoundingClientRect().bottom;
      const list = messagesRef.current;
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const m = list[i]!;
        if (isLocal(m)) continue;
        const node = document.getElementById(`message-${m.id}`);
        if (!node) continue;
        if (node.getBoundingClientRect().top < bottom - 8) {
          markReadUpTo(currentUserId, conversation.id, m.created_at);
          return;
        }
      }
    }, 350);
  }, [conversation.id, currentUserId]);


  // What realtime has said since the page was rendered, laid over the props
  // rather than copied from them. Copying props into state needs an effect to
  // keep the two in step, and an effect that sets state on every render of the
  // parent is a render loop waiting to happen; a lookup merged at read time
  // cannot fall behind because there is nothing to fall behind.
  //
  // Read and delivered marks only ever move forward, on the server and here:
  // a page kept on the phone, made before the other side read, can never show
  // an older mark than one already heard (realtime, a catch-up, the last time
  // this conversation was open — kept on the device, read-marks.ts).
  const [readSince, setReadSince] = useState<Record<string, string | null>>({});
  const [deliveredSince, setDeliveredSince] = useState<Record<string, string | null>>({});
  const members = useMemo(
    () =>
      initialMembers.map((m) =>
        m.user_id in readSince || m.user_id in deliveredSince
          ? {
              ...m,
              last_read_at: laterMark(m.last_read_at, readSince[m.user_id]),
              last_delivered_at: laterMark(m.last_delivered_at, deliveredSince[m.user_id]),
            }
          : m
      ),
    [initialMembers, readSince, deliveredSince]
  );
  /** Marks heard from anywhere: kept only where they move a member forward. */
  const heardMarks = useCallback(
    (rows: Array<{ user_id: string; last_read_at?: string | null; last_delivered_at?: string | null }>) => {
      const forward = (current: Record<string, string | null>, key: "last_read_at" | "last_delivered_at") => {
        let next = current;
        for (const row of rows) {
          const mark = row[key];
          if (!mark) continue;
          const was = current[row.user_id];
          if (laterMark(was, mark) === was) continue;
          if (next === current) next = { ...current };
          next[row.user_id] = mark;
        }
        return next;
      };
      setReadSince((current) => forward(current, "last_read_at"));
      setDeliveredSince((current) => forward(current, "last_delivered_at"));
      rememberMarks(currentUserId, conversation.id, rows);
    },
    [currentUserId, conversation.id]
  );
  // The marks heard the last time this conversation was open, before the page's own.
  useEffect(() => {
    let live = true;
    void Promise.resolve().then(() => {
      const kept = keptMarks(currentUserId, conversation.id);
      if (live && kept.length > 0) heardMarks(kept);
    });
    return () => {
      live = false;
    };
  }, [currentUserId, conversation.id, heardMarks]);
  const memberMap = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  // The realtime handlers read the members through this, so a read receipt —
  // which changes the members — does not tear the subscription down and set it
  // up again. It used to: every receipt left a gap in which the next one was
  // lost, and the second tick then waited for a reload.
  const memberMapRef = useRef(memberMap);
  useEffect(() => {
    memberMapRef.current = memberMap;
  }, [memberMap]);

  // The moment the last of the others caught up. One number, however many
  // people are in the room: a second tick that appeared when the first of
  // thirty parents looked would be telling the sender something untrue.
  //
  // The support desk is the exception, because it is one side of a two-sided
  // conversation however many people staff it. The person who asked has been
  // read once anybody at the desk has read them; the desk has been read once
  // the person who asked has.
  const isSupport = conversation.type === "support";
  // A channel's posts come from the channel: no names over them, no ticks
  // after them (a tick for a few hundred followers would mean nothing).
  const isChannel = conversation.type === "channel";
  const broadcast = isBroadcast(conversation.type);
  const requesterId = conversation.createdBy ?? null;
  //
  // "Delivered" is worked out the same way from when each of the others last
  // had everything reach them — reading counts as having it.
  const caughtUp = useCallback(
    (at: (m: ConversationMember) => number | null) => {
      const others = members.filter((m) => m.user_id !== currentUserId);
      if (others.length === 0) return null;
      if (isSupport && requesterId) {
        if (currentUserId === requesterId) {
          const times = others.map(at).filter((v): v is number => v !== null);
          return times.length > 0 ? Math.max(...times) : null;
        }
        const requester = others.find((m) => m.user_id === requesterId);
        return requester ? at(requester) : null;
      }
      let earliest = Infinity;
      for (const time of others.map(at)) {
        if (time === null) return null;
        earliest = Math.min(earliest, time);
      }
      return Number.isFinite(earliest) ? earliest : null;
    },
    [members, currentUserId, isSupport, requesterId]
  );
  const othersReadAt = useMemo(() => caughtUp((m) => (m.last_read_at ? new Date(m.last_read_at).getTime() : null)), [caughtUp]);
  const othersDeliveredAt = useMemo(
    () =>
      caughtUp((m) => {
        const read = m.last_read_at ? new Date(m.last_read_at).getTime() : null;
        const delivered = m.last_delivered_at ? new Date(m.last_delivered_at).getTime() : null;
        return read === null ? delivered : delivered === null ? read : Math.max(read, delivered);
      }),
    [caughtUp]
  );

  const receiptLabels = useMemo(
    () => ({ sending: t("receipt.sending"), sent: t("receipt.sent"), delivered: t("receipt.delivered"), seen: t("receipt.seen"), failed: t("receipt.failed") }),
    [t]
  );

  const [locating, setLocating] = useState(false);
  // A photo or file picked and waiting for its caption, and the photo being looked at.
  const [attached, setAttached] = useState<Attachment | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState<ViewedPhoto | null>(null);
  const [cardFor, setCardFor] = useState<MemberCardSeed | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // The shrunken photo, or the file, behind each bubble still on its way, so a
  // failed one can be sent again without asking for it a second time.
  const photos = useRef(new Map<string, PreparedImage>());
  const blobs = useRef(new Map<string, { blob: Blob; mime: string }>());
  // Every local link made in this thread, let go of when it closes.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const links = previews.current;
    return () => {
      for (const url of links) URL.revokeObjectURL(url);
    };
  }, []);

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
   * It is kept on the device first (outbox.ts), photos and files with their
   * bytes, so leaving the conversation, closing the app or losing the line
   * never loses it; it goes when it can, under its own id, so a retry after a
   * lost answer cannot make two. Once the server has it, it is kept as sent
   * (local-store.ts) with the server's own time, so the thread opens with it
   * whatever an older copy of the page said.
   *
   * Row level security and the guard trigger decide whether it may be
   * written. The push to everybody else is asked for once the row exists.
   */
  const deliver = useCallback(
    (local: ThreadMessage) => {
      upsert(local);
      const photo = local.type === "image" ? photos.current.get(local.id) : undefined;
      const blob = local.type === "file" || local.type === "audio" ? blobs.current.get(local.id) : undefined;
      const bytes = photo
        ? { blob: photo.blob, mime: photo.blob.type, width: photo.width, height: photo.height }
        : blob
          ? { blob: blob.blob, mime: blob.mime }
          : undefined;
      const id = local.id.startsWith("local:") ? local.id.slice(6) : crypto.randomUUID();
      const row: OutgoingRow = {
        id,
        conversation_id: local.conversation_id,
        sender_id: currentUserId,
        school_id: schoolId,
        content: local.content,
        type: local.type,
        reply_to_id: local.reply_to_id,
        location_lat: local.location_lat,
        location_lng: local.location_lng,
        media_path: local.media_path,
        media_width: local.media_width,
        media_height: local.media_height,
        media_name: local.media_name ?? null,
        media_size: local.media_size ?? null,
        media_mime: local.media_mime ?? null,
        media_duration: local.media_duration ?? null,
        created_at: local.created_at,
      };
      // Kept on the device before anything is sent (outbox.ts). A photo is
      // also kept as the conversation's own, so it shows from the device the
      // next time the conversation opens, not from a download.
      keepOutgoing(row, bytes);
      if (local.type === "image" && local.media_path && bytes) void keepPhoto(currentUserId, local.media_path, bytes.blob);
      // A photo, file or recording starts uploading now, alongside whatever
      // is ahead of it in the queue, and its message waits in line only for
      // the insert.
      const uploaded = local.media_path && bytes ? uploadMedia(local.media_path, bytes.blob, bytes.mime) : null;
      const failed = (key: string) => {
        failOutgoing(id);
        setMessages((current) => current.map((m) => (m.id === local.id ? { ...m, pending: false, failed: true } : m)));
        fail(key);
      };
      // `announce`: this page wrote it, so it settles it (kept, dropped from
      // the outbox, the push to the others asked for); written by another
      // path, the screen only catches up.
      const arrived = (createdAt: string | null, announce = true) => {
        if (announce) settled(row, createdAt);
        photos.current.delete(local.id);
        blobs.current.delete(local.id);
        setMessages((current) => {
          // Realtime or a catch-up may have brought the real row already; if
          // so the local one simply goes, rather than appearing twice.
          const there = current.some((m) => m.id === id);
          const next = there
            ? current.filter((m) => m.id !== local.id).map((m) => (m.id === id && !m.local_preview ? { ...m, local_preview: local.local_preview } : m))
            : current.map((m) => (m.id === local.id ? { ...m, id, pending: false, failed: false, created_at: createdAt ?? m.created_at } : m));
          return sortAsc(next);
        });
      };
      queue.current = queue.current.then(async () => {
        // The app's frame may be sending this very message from what was kept
        // (flushOutbox): it is waited for, not sent twice.
        while (!claimSending(id)) {
          await waitForLine(1500);
          if (!waitingRows().some((r) => r.id === id && !r.failed)) {
            if (!waitingRows().some((r) => r.id === id)) arrived(null, false);
            return;
          }
        }
        // Sent meanwhile by whoever had it before (an earlier opening of this
        // conversation, the app's frame): nothing left to send.
        if (!waitingRows().some((r) => r.id === id)) {
          releaseSending(id);
          arrived(null, false);
          return;
        }
        try {
          // A photo, file or recording that could not go up is tried again as
          // the line allows, a few times, before it is marked.
          let upload = uploaded;
          for (let tries = 0; local.media_path && !(await upload); tries += 1) {
            if (tries >= 6 || !bytes) {
              failed(local.type === "audio" ? "portal.messages.voiceFailed" : local.type === "file" ? "portal.messages.fileFailed" : "portal.messages.photoFailed");
              return;
            }
            await waitForLine(Math.min(30_000, 2000 * 2 ** tries));
            upload = uploadMedia(local.media_path, bytes.blob, bytes.mime);
          }
          // No line, or a line too slow to answer: the clock stays and the
          // message goes again — when the line is back, or after a growing
          // pause — and the ones after it wait their turn behind it.
          for (let tries = 0; ; tries += 1) {
            // Held by this page alone (claimSending), so gone only because it
            // was let go of: signed out, or deleted unsent. Nothing to send.
            if (!waitingRows().some((r) => r.id === id)) return;
            const result = await sendRow(row);
            if ("sent" in result) {
              arrived(result.createdAt);
              return;
            }
            if ("failed" in result) {
              failed(result.failed);
              return;
            }
            await waitForLine(Math.min(30_000, 1500 * 2 ** Math.min(tries, 5)));
          }
        } finally {
          releaseSending(id);
        }
      });
    },
    [currentUserId, schoolId, upsert, fail]
  );

  const localMessage = useCallback(
    (
      fields: Pick<ThreadMessage, "content" | "type" | "reply_to_id"> &
        Partial<
          Pick<
            ThreadMessage,
            | "location_lat"
            | "location_lng"
            | "media_path"
            | "media_width"
            | "media_height"
            | "media_name"
            | "media_size"
            | "media_mime"
            | "media_duration"
            | "local_preview"
          >
        >
    ): ThreadMessage => {
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
        location_lat: null,
        location_lng: null,
        media_path: null,
        media_width: null,
        media_height: null,
        media_name: null,
        media_size: null,
        media_mime: null,
        media_duration: null,
        reactions: [],
        pending: true,
        ...fields,
      };
    },
    [members, currentUserId, conversation.id]
  );

  // What was left waiting on this device (outbox.ts) — the app closed, or the
  // line went — comes back with its clock and goes, unless it already has;
  // what the server refused comes back marked, to be sent again or deleted.
  const restored = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (restored.current) return;
      restored.current = true;
      for (const row of outgoingFor(conversation.id, currentUserId)) {
        if (initialMessages.some((m) => m.id === row.id) || messagesRef.current.some((m) => m.id === row.id)) {
          dropOutgoing(row.id);
          continue;
        }
        const local: ThreadMessage = {
          ...localMessage({
            content: row.content,
            type: row.type,
            reply_to_id: row.reply_to_id,
            location_lat: row.location_lat,
            location_lng: row.location_lng,
            media_path: row.media_path ?? null,
            media_width: row.media_width ?? null,
            media_height: row.media_height ?? null,
            media_name: row.media_name ?? null,
            media_size: row.media_size ?? null,
            media_mime: row.media_mime ?? null,
            media_duration: row.media_duration ?? null,
          }),
          id: `local:${row.id}`,
          created_at: row.created_at ?? new Date().toISOString(),
        };
        if (row.failed) {
          upsert({ ...local, pending: false, failed: true });
          continue;
        }
        if (row.type === "text" || row.type === "location") {
          deliver(local);
          continue;
        }
        // A photo, file or recording: its bytes back from the device, then on its way.
        upsert(local);
        void outgoingBytes(row).then((kept) => {
          if (!kept) {
            failOutgoing(row.id);
            upsert({ ...local, pending: false, failed: true });
            return;
          }
          const preview = URL.createObjectURL(kept.blob);
          previews.current.add(preview);
          if (row.type === "image") {
            photos.current.set(local.id, {
              blob: kept.blob,
              width: kept.width ?? row.media_width ?? 0,
              height: kept.height ?? row.media_height ?? 0,
              extension: kept.blob.type === "image/webp" ? "webp" : "jpg",
              previewUrl: preview,
            });
          } else {
            blobs.current.set(local.id, { blob: kept.blob, mime: kept.mime });
          }
          deliver({ ...local, local_preview: preview });
        });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [conversation.id, currentUserId, initialMessages, deliver, localMessage, upsert]);

  const retry = useCallback(
    (failed: ThreadMessage) => {
      // The refused one goes from what is kept; it is sent again as a new message.
      if (failed.id.startsWith("local:")) dropOutgoing(failed.id.slice(6));
      setMessages((current) => current.filter((m) => m.id !== failed.id));
      const again = localMessage({
        content: failed.content,
        type: failed.type,
        reply_to_id: failed.reply_to_id,
        location_lat: failed.location_lat,
        location_lng: failed.location_lng,
        // The same path as the first time: if the upload did land then,
        // this one is told so and the message simply goes.
        media_path: failed.media_path,
        media_width: failed.media_width,
        media_height: failed.media_height,
        media_name: failed.media_name,
        media_size: failed.media_size,
        media_mime: failed.media_mime,
        media_duration: failed.media_duration,
        local_preview: failed.local_preview,
      });
      const photo = photos.current.get(failed.id);
      if (photo) {
        photos.current.delete(failed.id);
        photos.current.set(again.id, photo);
      }
      const blob = blobs.current.get(failed.id);
      if (blob) {
        blobs.current.delete(failed.id);
        blobs.current.set(again.id, blob);
      }
      deliver(again);
    },
    [deliver, localMessage]
  );

  // ------------------------------------------------------------- typing…

  // A private channel per conversation, which only its members may join
  // (00071). Nothing said on it is stored.
  //
  // In a one-to-one the same channel says who is here: "here" when the
  // conversation opens (asking the other side to answer in kind), again every
  // twenty-five seconds while it is on screen, "gone" when it is left. The
  // other side is "online" while it has been heard from in the last
  // forty-five seconds, and "last seen" from the moment it said "gone".
  const typingChannel = useRef<RealtimeChannel | null>(null);
  const lastTypingSent = useRef(0);
  const [heardAt, setHeardAt] = useState<Record<string, number>>({});
  const [leftAt, setLeftAt] = useState<string | null>(null);
  const tracksPresence = conversation.type === "direct";
  useEffect(() => {
    const supabase = getBrowserClient();
    const say = (payload: { ask?: boolean; gone?: boolean }) =>
      void channel.send({ type: "broadcast", event: "here", payload: { user_id: currentUserId, ...payload } });
    const channel = supabase
      .channel(`chat:${conversation.id}`, { config: { private: true, broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const said = payload as { user_id?: unknown; kind?: unknown };
        if (typeof said.user_id !== "string" || said.user_id === currentUserId) return;
        const who = said.user_id;
        const kind = said.kind === "recording" ? "recording" : "typing";
        setTypingNow((current) => ({ ...current, [who]: { kind, until: Date.now() + 5000 } }));
        setHeardAt((current) => ({ ...current, [who]: Date.now() }));
      })
      .on("broadcast", { event: "here" }, ({ payload }) => {
        if (!tracksPresence) return;
        const said = payload as { user_id?: unknown; ask?: unknown; gone?: unknown };
        if (typeof said.user_id !== "string" || said.user_id === currentUserId) return;
        const who = said.user_id;
        if (said.gone === true) {
          setHeardAt((current) => {
            const next = { ...current };
            delete next[who];
            return next;
          });
          setLeftAt(new Date().toISOString());
          return;
        }
        setHeardAt((current) => ({ ...current, [who]: Date.now() }));
        if (said.ask === true && document.visibilityState === "visible") say({});
      });
    listen(channel, (status) => {
      if (status === "SUBSCRIBED" && tracksPresence && document.visibilityState === "visible") say({ ask: true });
    });
    typingChannel.current = channel;
    const sweep = window.setInterval(() => {
      const at = Date.now();
      setTypingNow((current) => {
        const live = Object.entries(current).filter(([, value]) => value.until > at);
        return live.length === Object.keys(current).length ? current : Object.fromEntries(live);
      });
      setHeardAt((current) => {
        const live = Object.entries(current).filter(([, heard]) => at - heard < 45_000);
        return live.length === Object.keys(current).length ? current : Object.fromEntries(live);
      });
    }, 1000);
    const heartbeat = tracksPresence
      ? window.setInterval(() => {
          if (document.visibilityState === "visible") say({});
        }, 25_000)
      : undefined;
    const onVisibility = () => {
      if (!tracksPresence) return;
      say(document.visibilityState === "visible" ? { ask: true } : { gone: true });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(sweep);
      if (heartbeat) window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibility);
      if (tracksPresence) say({ gone: true });
      typingChannel.current = null;
      void supabase.removeChannel(channel);
    };
  }, [conversation.id, currentUserId, tracksPresence]);

  const announceTyping = useCallback(
    (kind: "typing" | "recording") => {
      const at = Date.now();
      if (at - lastTypingSent.current < 2500) return;
      lastTypingSent.current = at;
      void typingChannel.current?.send({ type: "broadcast", event: "typing", payload: { user_id: currentUserId, kind } });
    },
    [currentUserId]
  );

  // --------------------------------------------------------- voice notes

  const sendRecording = useCallback(
    (recording: Recording) => {
      const preview = URL.createObjectURL(recording.blob);
      previews.current.add(preview);
      const local = localMessage({
        content: "",
        type: "audio",
        reply_to_id: replyTo?.id ?? null,
        media_path: mediaPath(schoolId, conversation.id, currentUserId, recording.extension),
        media_size: recording.blob.size,
        media_mime: recording.mime,
        media_duration: Math.max(1, recording.duration),
        local_preview: preview,
      });
      blobs.current.set(local.id, { blob: recording.blob, mime: recording.mime });
      stickToBottom.current = true;
      setReplyTo(null);
      deliver(local);
    },
    [localMessage, replyTo, schoolId, conversation.id, currentUserId, deliver]
  );
  const voice = useVoiceRecorder(sendRecording);
  const recordable = useSyncExternalStore(noSubscription, canRecord, cannotRecordOnServer);
  useEffect(() => {
    if (voice.recording) announceTyping("recording");
  }, [voice.recording, voice.elapsed, announceTyping]);

  const startRecording = async () => {
    const result = await voice.start();
    if (result === "denied") toast("danger", t("micDenied"));
    else if (result === "unsupported") toast("danger", t("micUnsupported"));
    else if (result === "failed") toast("danger", t("micFailed"));
  };

  const finishRecording = async () => {
    const recording = await voice.stop();
    if (recording) sendRecording(recording);
  };

  // ------------------------------------------------------------ location

  /**
   * Sends where you are, once, after the phone or the browser has asked
   * (location.tsx: the app's own prompt first, then a quick and a precise
   * position together).
   *
   * Nothing is watched and nothing is remembered: this asks for a single
   * position at the moment the button is pressed. A refusal is a refusal — it
   * says so and stops, rather than asking again on the next tap.
   */
  const shareLocation = useCallback(async () => {
    setLocating(true);
    const found = await locate();
    setLocating(false);
    if ("failure" in found) {
      toast(
        "danger",
        found.failure === "unsupported"
          ? t("locationUnsupported")
          : found.failure === "denied"
            ? t("locationDenied")
            : found.failure === "off"
              ? t("locationOff")
              : t("locationFailed")
      );
      return;
    }
    // Rounded here as well as in the column: a browser will happily report
    // fourteen decimal places, a claim no phone can support.
    const latitude = Number(found.position.coords.latitude.toFixed(6));
    const longitude = Number(found.position.coords.longitude.toFixed(6));
    const label = draft.get().trim().slice(0, 200);
    draft.set("");
    stickToBottom.current = true;
    deliver(localMessage({ content: label, type: "location", reply_to_id: null, location_lat: latitude, location_lng: longitude }));
  }, [draft, t, toast, deliver, localMessage]);

  // ---------------------------------------------------------- attachments

  const replaceAttachment = useCallback((next: Attachment | null) => {
    setAttached((previous) => {
      if (previous?.kind === "photo") {
        URL.revokeObjectURL(previous.image.previewUrl);
        previews.current.delete(previous.image.previewUrl);
      }
      return next;
    });
  }, []);

  /**
   * A photo from the picker, a paste or a drop: shrunk on this device and
   * held above the composer until it is sent, so whatever is typed meanwhile
   * becomes its caption.
   */
  const attachPhoto = useCallback(
    async (file: File) => {
      setPreparing(true);
      const result = await prepareImage(file);
      setPreparing(false);
      if (!result.ok) {
        toast("danger", t(`photoErrors.${result.error}`));
        return;
      }
      previews.current.add(result.image.previewUrl);
      replaceAttachment({ kind: "photo", image: result.image });
      inputRef.current?.focus();
    },
    [t, toast, replaceAttachment]
  );

  /** Any other file: checked here, sent as it is. */
  const attachFile = useCallback(
    (file: File) => {
      const check = checkFile(file.name, file.size);
      if (!check.ok) {
        toast("danger", t(`fileErrors.${check.error}`));
        return;
      }
      replaceAttachment({ kind: "file", file, name: check.name, mime: check.mime, size: file.size, extension: check.extension });
      inputRef.current?.focus();
    },
    [t, toast, replaceAttachment]
  );

  /** A photo goes the photo's way (shrunk, shown); everything else as a file. */
  const attachAny = useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      if (/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) void attachPhoto(file);
      else attachFile(file);
    },
    [attachPhoto, attachFile]
  );

  const other = conversation.type === "direct" ? members.find((m) => m.user_id !== currentUserId) : undefined;
  const iBlockedOther = Boolean(other && blockedUserIds.includes(other.user_id));
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  // ------------------------------------------------------------ scrolling

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

  // The conversation's box changes size — the keyboard opens, a reply or a
  // photo appears above the composer — and the newest message stays in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distance < 120;
    const far = distance > 320;
    if (far !== farFromBottom.current) {
      farFromBottom.current = far;
      setShowJump(far);
      if (!far) setUnseen(0);
    }
    // Scrolled down to what had not been seen yet: it is read now.
    readSoon();
  };

  const toLatest = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setUnseen(0);
  };

  // ------------------------------------------------------- kept and caught up

  // What this device kept of the conversation (local-store.ts), for whatever
  // the page did not bring — it may be an older copy of the page. Only where
  // the two meet, so the screen never has a hole: what was kept whole is
  // joined to the page where they overlap, or replaces a page older than it;
  // kept further back than the page, with something maybe missing between,
  // it waits for the server (loadOlder).
  useEffect(() => {
    let live = true;
    void keptMessages(currentUserId, conversation.id).then(({ run, messages: kept }) => {
      if (!live || kept.length === 0) return;
      const s = span.current;
      const inRun = run ? kept.filter((m) => at(m.created_at) >= run.from && at(m.created_at) <= run.to) : [];
      const oldestInRun = inRun.length > 0 ? at(inRun[0]!.created_at) : null;
      const newerThan = (moment: number) => kept.filter((m) => at(m.created_at) > moment);
      let add: ThreadMessage[];
      let dropBefore: number | null = null;
      if (run && oldestInRun !== null && (s === null || oldestInRun > s.to)) {
        // Nothing from the server on the screen, or a page older than what
        // the device has kept whole since: the kept stretch it is.
        dropBefore = oldestInRun;
        add = [...inRun, ...newerThan(run.to)];
        span.current = { from: oldestInRun, to: run.to };
        setHasMore(true);
      } else if (run && oldestInRun !== null && s !== null && run.to >= s.from) {
        const to = Math.max(s.to, run.to);
        add = [...inRun, ...newerThan(to)];
        span.current = { from: Math.min(s.from, oldestInRun), to };
        if (oldestInRun < s.from) setHasMore(true);
      } else {
        // Kept whole only further back than the page, or nothing kept whole:
        // only what is newer than the screen, for the next catch-up to check.
        add = s ? newerThan(s.to) : kept;
      }
      if (add.length === 0 && dropBefore === null) return;
      const cut = dropBefore;
      setMessages((current) => mergeMissing(cut === null ? current : current.filter((m) => isLocal(m) || at(m.created_at) >= cut), add));
    });
    return () => {
      live = false;
    };
  }, [conversation.id, currentUserId]);

  /** The others' read and delivered marks, from the server. A channel shows no ticks: none asked for. */
  const refreshMarks = useCallback(async () => {
    if (isBroadcast(conversation.type)) return;
    try {
      const { data, error } = await getBrowserClient()
        .from("conversation_members")
        .select("user_id, last_read_at, last_delivered_at")
        .eq("conversation_id", conversation.id);
      if (!error && data) heardMarks(data);
    } catch {
      // Asked again at the next catch-up.
    }
  }, [conversation.id, conversation.type, heardMarks]);

  /**
   * The newest of the conversation from the server, laid over what is on the
   * screen (mergeServer). If more has been said since the newest message
   * known here than one page holds, the pages in between are fetched too, so
   * no gap is left.
   */
  const catchUp = useCallback(async () => {
    const supabase = getBrowserClient();
    const page = async (before?: ThreadMessage): Promise<ThreadMessage[] | null> => {
      try {
        const { data, error } = await supabase.rpc("get_conversation_messages", {
          p_conversation_id: conversation.id,
          p_limit: 50,
          ...(before ? { p_before_created_at: before.created_at, p_before_id: before.id } : {}),
        });
        return error || !data ? null : (data as unknown as ThreadMessage[]);
      } catch {
        return null;
      }
    };
    // How far the others have read and received: the ticks, whatever realtime missed.
    void refreshMarks();
    // Deleted for oneself on another device since this page was made: hidden here too.
    void Promise.resolve(
      supabase.from("conversation_members").select("cleared_at").eq("conversation_id", conversation.id).eq("user_id", currentUserId).maybeSingle()
    ).then(
      ({ data, error }) => {
        if (!error && data?.cleared_at) hideUpTo(at(data.cleared_at));
      },
      () => undefined
    );
    // Newest first, down to the end of the screen's stretch with nothing
    // missing (`span`) — not to its newest message, which may stand after a
    // hole (one's own, sent from the outbox while the thread was closed).
    const s = span.current;
    const reaches = (list: ThreadMessage[]) => s !== null && list.length > 0 && at(list[list.length - 1]!.created_at) <= s.to;
    let rows = await page();
    if (!rows) return;
    let lastFull = rows.length >= 50;
    // A page that is not full is the start of the conversation: nothing before it is missing.
    let joined = !lastFull || reaches(rows);
    for (let pages = 0; !joined && s !== null && pages < 5; pages += 1) {
      const more = await page(rows[rows.length - 1]!);
      // The line failed half way: nothing is laid over the screen, which
      // would leave a hole in it; the next catch-up (back online, the app
      // shown again, realtime rejoined) starts again.
      if (!more) return;
      rows = rows.concat(more);
      lastFull = more.length >= 50;
      joined = !lastFull || reaches(more);
    }
    const fetched = rows;
    // On the device at once, as they came (the stretch they make whole is recorded with the screen's, saveKept).
    void keepMessages(currentUserId, fetched);
    if (fetched.length > 0) {
      const newest = at(fetched[0]!.created_at);
      const oldest = at(fetched[fetched.length - 1]!.created_at);
      const now = span.current;
      if (joined && now !== null) {
        setMessages((current) => mergeServer(current, fetched));
        span.current = { from: Math.min(now.from, oldest), to: Math.max(now.to, newest) };
        // The server's history goes back further than the screen's did.
        if (oldest < now.from) setHasMore(lastFull);
      } else {
        // Nothing on the screen known to be whole, or more said while away
        // than is fetched at once: what the screen had before the fetched
        // stretch goes, and the history is paged in from here, in order,
        // with no hole (loadOlder).
        setMessages((current) => mergeServer(current.filter((m) => isLocal(m) || at(m.created_at) >= oldest), fetched));
        span.current = { from: oldest, to: newest };
        setHasMore(lastFull || !joined);
      }
    }
    readSoon();
  }, [conversation.id, currentUserId, hideUpTo, readSoon, refreshMarks]);

  // Everything the server has said, kept on the device as it comes — the
  // page's messages, realtime's, the catch-up's, older pages, edits — with
  // the stretch of it that has nothing missing (local-store.ts).
  const keptRef = useRef(new Map<string, ThreadMessage>());
  const keptSpan = useRef("");
  const saveKept = useCallback(() => {
    const s = span.current;
    const changed = messagesRef.current.filter((m) => !isLocal(m) && keptRef.current.get(m.id) !== m);
    const spanKey = s ? `${s.from}:${s.to}` : "";
    if (changed.length === 0 && spanKey === keptSpan.current) return;
    for (const m of changed) keptRef.current.set(m.id, m);
    keptSpan.current = spanKey;
    const inSpan = s ? changed.filter((m) => at(m.created_at) >= s.from && at(m.created_at) <= s.to) : [];
    const inside = new Set(inSpan.map((m) => m.id));
    const outside = changed.filter((m) => !inside.has(m.id));
    if (s) void keepRun(currentUserId, conversation.id, inSpan, s.from, s.to);
    if (outside.length > 0) void keepMessages(currentUserId, outside);
  }, [currentUserId, conversation.id]);
  useEffect(() => {
    const timer = window.setTimeout(saveKept, 400);
    return () => window.clearTimeout(timer);
  }, [messages, saveKept]);
  // Leaving the conversation, or the app put aside, keeps what is on the
  // screen at once: leaving within the pause above used to cancel it, and the
  // newest messages were not there the next time it opened.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") saveKept();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", saveKept);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", saveKept);
      saveKept();
    };
  }, [saveKept]);

  // --------------------------------------------------------------- realtime

  const applyReaction = useCallback((messageId: string, userId: string, emoji: string | null) => {
    setMessages((current) => current.map((m) => (m.id === messageId ? withReaction(m, userId, emoji) : m)));
  }, []);

  // Realtime: RLS delivers only messages of conversations the user belongs to.
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`thread:${conversation.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` }, (payload) => {
        const row = payload.new as MessageRow;
        const sender = row.sender_id ? memberMapRef.current.get(row.sender_id) : undefined;
        if (row.sender_id === currentUserId) {
          // Our own message, back from realtime — from this device (it takes
          // the place of its bubble, made here under the same id) or from
          // another one of ours.
          const arrived: ThreadMessage = {
            ...row,
            sender_first_name: sender?.first_name ?? null,
            sender_last_name: sender?.last_name ?? null,
            sender_avatar_url: sender?.avatar_url ?? null,
            is_favorite: false,
            reactions: [],
          };
          setMessages((current) => (current.some((m) => m.id === row.id) ? current : mergeServer(current, [arrived])));
          void keepMessages(currentUserId, [arrived]);
          return;
        }
        if (row.sender_id) {
          const from = row.sender_id;
          setTypingNow((current) => {
            if (!(from in current)) return current;
            const next = { ...current };
            delete next[from];
            return next;
          });
        }
        if (!stickToBottom.current) setUnseen((count) => count + 1);
        // Kept on the device the moment it arrives, not only when the
        // conversation is left: the app may be closed straight after.
        if (row.sender_id && !sender) {
          void fetchMessageAction(conversation.id, row.id).then((result) => {
            if (!result.ok || !result.data) return;
            upsert(result.data);
            void keepMessages(currentUserId, [result.data]);
          });
        } else {
          const arrived: ThreadMessage = {
            ...row,
            sender_first_name: sender?.first_name ?? null,
            sender_last_name: sender?.last_name ?? null,
            sender_avatar_url: sender?.avatar_url ?? null,
            is_favorite: false,
            reactions: [],
          };
          upsert(arrived);
          void keepMessages(currentUserId, [arrived]);
        }
        // Seen if it is on the screen — read once it has been drawn there.
        readSoon();
      })
      // Somebody opened the conversation: their last_read_at changed, and the
      // sender is owed the second tick without reloading anything.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation_members", filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          const row = payload.new as { user_id: string; last_read_at: string | null; last_delivered_at?: string | null };
          heardMarks([row]);
        }
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` }, (payload) => {
        const row = payload.new as MessageRow;
        setMessages((current) =>
          current.map((m) =>
            m.id === row.id
              ? {
                  ...m,
                  content: row.is_deleted ? "" : row.content,
                  is_edited: row.is_edited,
                  is_deleted: row.is_deleted,
                  is_pinned: row.is_pinned,
                  edited_at: row.edited_at,
                  ...(row.is_deleted ? EMPTIED : {}),
                }
              : m
          )
        );
        setPinned((current) => {
          const without = current.filter((p) => p.id !== row.id);
          if (!row.is_pinned || row.is_deleted) return without;
          const sender = row.sender_id ? memberMapRef.current.get(row.sender_id) : undefined;
          return [...without, { id: row.id, content: row.content, sender_first_name: sender?.first_name ?? null, sender_last_name: sender?.last_name ?? null }];
        });
      })
      // A reaction added, changed or taken back (taking back clears the
      // emoji rather than deleting the row, so it arrives here too).
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions", filter: `conversation_id=eq.${conversation.id}` }, (payload) => {
        const row = payload.new as { message_id: string; user_id: string; emoji: string | null };
        applyReaction(row.message_id, row.user_id, row.emoji);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "message_reactions", filter: `conversation_id=eq.${conversation.id}` }, (payload) => {
        const row = payload.new as { message_id: string; user_id: string; emoji: string | null };
        applyReaction(row.message_id, row.user_id, row.emoji);
      });
    // Every time realtime is (back) on — the first time, and after any drop
    // of the line — what was said meanwhile is fetched: nothing said while
    // the app was asleep or the line was gone is missed.
    listen(channel, (status) => {
      if (status === "SUBSCRIBED") void catchUp();
    });

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      readSoon();
      void catchUp();
    };
    const onOnline = () => void catchUp();
    // Opening the thread is reading what it shows (never done while a page
    // is only fetched ahead: warm-pages.ts) — what is on the screen, once drawn.
    readSoon();
    // What was said since the page was made, at once: not only once realtime
    // has joined, which on a weak line can take seconds.
    void Promise.resolve().then(catchUp);
    // Realtime on a phone can stop without a word (the line changed, the app
    // was put aside). While the conversation is on the screen it also looks
    // for itself, lightly: the ticks, and whether the newest message is here.
    const look = window.setInterval(() => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      void refreshMarks();
      void Promise.resolve(supabase.rpc("get_conversation_messages", { p_conversation_id: conversation.id, p_limit: 1 })).then(
        ({ data, error }) => {
          const newest = !error && Array.isArray(data) ? (data[0] as { id?: string } | undefined) : undefined;
          if (newest?.id && !messagesRef.current.some((m) => m.id === newest.id)) void catchUp();
        },
        () => undefined
      );
    }, 8000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(look);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      void supabase.removeChannel(channel);
    };
  }, [conversation.id, currentUserId, upsert, applyReaction, catchUp, readSoon, heardMarks, refreshMarks]);

  // --------------------------------------------------------- full screen

  // On a phone the conversation is the whole screen, as in any messenger:
  // above the portal's bars, sized to what the keyboard leaves visible, with
  // the page behind it held still. On a computer the same, on request.
  useEffect(() => {
    const root = document.documentElement;
    const phone = window.matchMedia("(max-width: 1023.98px)");
    const view = window.visualViewport;
    const fit = () => {
      if (!view) return;
      root.style.setProperty("--vvh", `${Math.round(view.height)}px`);
      root.style.setProperty("--vvt", `${Math.round(view.offsetTop)}px`);
    };
    const lock = () => root.classList.toggle("chat-lock", phone.matches || expanded);
    fit();
    lock();
    view?.addEventListener("resize", fit);
    view?.addEventListener("scroll", fit);
    phone.addEventListener("change", lock);
    return () => {
      view?.removeEventListener("resize", fit);
      view?.removeEventListener("scroll", fit);
      phone.removeEventListener("change", lock);
      root.classList.remove("chat-lock");
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vvt");
    };
  }, [expanded]);

  // Leaving the browser's full screen (Esc) leaves the chat's too.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setExpanded(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    try {
      if (next && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined);
      if (!next && document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    } catch {
      /* the overlay alone is full screen enough */
    }
  };

  // Opened from a notification's "Reply" where the browser had no box for it.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("reply")) inputRef.current?.focus();
  }, []);

  // ------------------------------------------------------------- actions

  // An older page, fetched from just before the oldest on the screen: the
  // stretch with nothing missing now reaches back to it.
  const widenBack = useCallback((older: ThreadMessage[]) => {
    const s = span.current;
    if (!s || older.length === 0) return;
    span.current = { from: Math.min(s.from, ...older.map((m) => at(m.created_at))), to: s.to };
  }, []);

  const loadOlder = () => {
    const oldest = messages[0];
    if (!oldest) return;
    startLoadingOlder(async () => {
      const result = await loadOlderMessagesAction(conversation.id, oldest.created_at, oldest.id);
      if (!result.ok) return fail(result.message);
      const older = result.data ?? [];
      const el = scrollRef.current;
      if (el) preserveScroll.current = el.scrollHeight - el.scrollTop;
      widenBack(older);
      setMessages((current) => sortAsc([...older.filter((m) => !current.some((c) => c.id === m.id)), ...current]));
      setHasMore(older.length >= 50);
    });
  };

  /**
   * A tap on a quote: the message it quotes, scrolled to the middle and lit
   * for a moment. Further back than what is loaded, the history is fetched
   * page by page until it turns up — six pages at most.
   */
  const jumpTo = useCallback(
    async (id: string) => {
      const reveal = () => {
        const element = document.getElementById(`message-${id}`);
        if (!element) return false;
        stickToBottom.current = false;
        element.scrollIntoView({ block: "center", behavior: "smooth" });
        setFlash(id);
        window.setTimeout(() => setFlash((current) => (current === id ? null : current)), 1800);
        return true;
      };
      if (reveal()) return;
      for (let page = 0; page < 6; page++) {
        const oldest = messagesRef.current[0];
        if (!oldest) break;
        const result = await loadOlderMessagesAction(conversation.id, oldest.created_at, oldest.id);
        if (!result.ok) break;
        const older = result.data ?? [];
        setHasMore(older.length >= 50);
        if (older.length === 0) break;
        const el = scrollRef.current;
        if (el) preserveScroll.current = el.scrollHeight - el.scrollTop;
        widenBack(older);
        messagesRef.current = sortAsc([...older.filter((m) => !messagesRef.current.some((c) => c.id === m.id)), ...messagesRef.current]);
        setMessages(messagesRef.current);
        if (older.some((m) => m.id === id)) {
          await nextFrame();
          await nextFrame();
          if (reveal()) return;
          break;
        }
        if (older.length < 50) break;
      }
      toast("danger", t("originalNotFound"));
    },
    [conversation.id, t, toast, widenBack]
  );

  const react = useCallback(
    (message: ThreadMessage, emoji: string | null) => {
      const before = (message.reactions ?? []).find((r) => r.user_id === currentUserId)?.emoji ?? null;
      applyReaction(message.id, currentUserId, emoji);
      void getBrowserClient()
        .rpc("set_message_reaction", { p_message_id: message.id, p_emoji: emoji ?? "" })
        .then(({ error }) => {
          if (!error) return;
          applyReaction(message.id, currentUserId, before);
          fail(dbErrorKey(error) ?? "errors.unexpected");
        });
    },
    [applyReaction, currentUserId, fail]
  );

  const submit = () => {
    const content = draft.get().trim();
    if (editing) {
      if (saving || !content) return;
      const target = editing;
      startSaving(async () => {
        const result = await editMessageAction(target.id, content);
        if (!result.ok) return fail(result.message);
        upsert({ ...target, content, is_edited: true });
        setEditing(null);
        draft.set("");
      });
      return;
    }

    // The message appears the moment it is typed, not when the server agrees.
    // The draft clears, the bubble is there with a clock, and the box is ready
    // for the next sentence before the first has arrived anywhere.
    if (!content && !attached) return;
    stickToBottom.current = true;
    draft.set("");
    setReplyTo(null);
    const reply_to_id = replyTo?.id ?? null;
    if (attached?.kind === "photo") {
      const photo = attached.image;
      setAttached(null);
      const local = localMessage({
        content,
        type: "image",
        reply_to_id,
        media_path: mediaPath(schoolId, conversation.id, currentUserId, photo.extension),
        media_width: photo.width,
        media_height: photo.height,
        local_preview: photo.previewUrl,
      });
      photos.current.set(local.id, photo);
      deliver(local);
    } else if (attached?.kind === "file") {
      const file = attached;
      setAttached(null);
      const local = localMessage({
        content,
        type: "file",
        reply_to_id,
        media_path: mediaPath(schoolId, conversation.id, currentUserId, file.extension),
        media_name: file.name,
        media_size: file.size,
        media_mime: file.mime,
      });
      blobs.current.set(local.id, { blob: file.file, mime: file.mime });
      deliver(local);
    } else {
      deliver(localMessage({ content, type: "text", reply_to_id }));
    }
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape" && (editing || replyTo)) {
      setEditing(null);
      setReplyTo(null);
      draft.set("");
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

  const nameOf = (userId: string) => {
    const person = memberMap.get(userId);
    return person ? `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim() || t("unknownUser") : t("unknownUser");
  };

  /** One line for a message quoted in a reply. */
  const gist = (m: ThreadMessage) =>
    m.is_deleted
      ? t("deletedMessage")
      : m.type === "location"
        ? t("locationShort")
        : m.type === "image"
          ? m.content ? `📷 ${m.content}` : `📷 ${t("photo")}`
          : m.type === "file"
            ? `📎 ${m.content || m.media_name || t("fileShort")}`
            : m.type === "audio"
              ? `🎤 ${t("voice")} · ${formatDuration(m.media_duration)}`
              : m.content;

  const openCard = (userId: string | null) => {
    if (!userId) return;
    setCardFor({ userId, name: nameOf(userId), avatarUrl: memberMap.get(userId)?.avatar_url ?? null });
  };

  const openPhoto = (m: ThreadMessage, src: string) =>
    setViewing({
      src,
      caption: m.content,
      title: m.sender_id === currentUserId ? t("you") : senderName(m),
      subtitle: `${formatDate(m.created_at, locale, timeZone)} · ${formatClock(m.created_at, locale, timeZone)}`,
    });

  const startReply = (m: ThreadMessage) => {
    setEditing(null);
    setReplyTo(m);
    inputRef.current?.focus();
  };

  // Photos and files come in by the button, a paste, or dropped onto the conversation.
  const acceptsFiles = canPost && !iBlockedOther && !editing && !voice.recording;

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

  // Whose card the header opens: the other side of a one-to-one, or, for the
  // desk, the person asking. Somebody asking the desk sees the desk, not a card.
  const headerPerson = other?.user_id ?? (isSupport && requesterId && currentUserId !== requesterId ? requesterId : undefined);
  const backHref = isSupport && currentUserId === requesterId ? "/dashboard" : "/messages";
  const typingEntries = Object.entries(typingNow);
  const typingLine = (() => {
    const first = typingEntries[0];
    if (!first) return null;
    const [userId, { kind }] = first;
    if (conversation.type === "direct") return kind === "recording" ? t("recordingAudio") : t("typing");
    const name = memberMap.get(userId)?.first_name ?? t("unknownUser");
    return kind === "recording" ? t("recordingName", { name }) : t("typingName", { name });
  })();
  const otherOnline = Boolean(other && heardAt[other.user_id]);
  const lastSeen = leftAt ?? conversation.lastSeenAt ?? null;
  const presenceLine = !other
    ? undefined
    : otherOnline
      ? t("online")
      : lastSeen
        ? dayKey(lastSeen, timeZone) === dayKey(new Date(), timeZone)
          ? t("lastSeenToday", { time: formatClock(lastSeen, locale, timeZone) })
          : t("lastSeenOn", { date: formatDate(lastSeen, locale, timeZone), time: formatClock(lastSeen, locale, timeZone) })
        : undefined;
  const subtitle =
    typingLine ??
    conversation.subtitle ??
    (isChannel
      ? t("followers", { count: members.length })
      : conversation.type !== "direct" && !isSupport
        ? t("memberCount", { count: members.length })
        : presenceLine);
  const wallpaperNames = Object.fromEntries(WALLPAPERS.map((name) => [name, t(`wallpapers.${name}`)])) as Record<Wallpaper, string>;
  const attachedFileKind = attached?.kind === "file" ? kindOf(attached.name, attached.mime) : null;

  return (
    <div
      className={cn("chat chat-screen relative flex h-full min-h-0 flex-col", expanded && "chat-expanded")}
      onDragOver={(event) => {
        if (!acceptsFiles || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!acceptsFiles) return;
        event.preventDefault();
        setDragging(false);
        attachAny(event.dataTransfer.files[0]);
      }}
    >
      {dragging ? (
        <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-500 bg-surface/85 text-brand-text backdrop-blur-sm">
          <Paperclip className="size-10" aria-hidden />
          <p className="text-sm font-semibold">{t("dropFile")}</p>
        </div>
      ) : null}
      <header className="chat-header flex items-center gap-2 px-2.5 py-2 sm:px-4">
        <Link href={backHref} className={buttonClasses("ghost", "icon-sm", isSupport ? "" : "lg:hidden")} aria-label={t("back")}>
          <ArrowLeft aria-hidden />
        </Link>
        <HeaderIdentity person={headerPerson} onOpen={() => openCard(headerPerson ?? null)} label={t("card.open")}>
          {isSupport ? (
            <span className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-solid text-brand-on-solid" aria-hidden>
              <Headset className="size-5" />
              <span className="absolute bottom-0 end-0 size-2.5 rounded-full bg-success-600 ring-2 ring-surface" />
            </span>
          ) : conversation.type === "direct" ? (
            <span className="relative shrink-0">
              <Avatar name={conversation.title} src={other?.avatar_url} size="md" />
              {otherOnline ? <span className="absolute bottom-0 end-0 size-2.5 rounded-full bg-success-600 ring-2 ring-[var(--chat-bar)]" aria-hidden /> : null}
            </span>
          ) : isChannel ? (
            <span className="chat-channel-mark inline-flex size-10 shrink-0 items-center justify-center rounded-full" aria-hidden>
              <Megaphone className="size-[1.125rem]" strokeWidth={1.75} />
            </span>
          ) : (
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-secondary" aria-hidden>
              <Users className="size-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[0.9375rem] font-semibold leading-tight text-ink">{conversation.title}</h1>
            {subtitle ? (
              <p className={cn("truncate text-xs", typingLine || otherOnline ? "font-medium text-success-700" : "text-ink-muted")} aria-live="polite">
                {subtitle}
              </p>
            ) : null}
          </div>
        </HeaderIdentity>
        <button
          type="button"
          onClick={toggleExpanded}
          aria-label={expanded ? t("exitFullScreen") : t("fullScreen")}
          title={expanded ? t("exitFullScreen") : t("fullScreen")}
          className={cn(buttonClasses("ghost", "icon-sm"), "hidden lg:inline-flex")}
        >
          {expanded ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
        </button>
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
            <Overlay.DropdownMenuItem onSelect={() => setWallpaperOpen(true)}>
              <Palette aria-hidden />
              {t("wallpaper")}
            </Overlay.DropdownMenuItem>
            <Overlay.DropdownMenuItem onSelect={() => setTextSizeOpen(true)}>
              <ALargeSmall aria-hidden />
              {t("textSize.title")}
            </Overlay.DropdownMenuItem>
            {conversation.type !== "direct" && !isSupport && !isChannel ? (
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
            {isChannel && myRole === "admin" ? (
              <>
                <Overlay.DropdownMenuSeparator />
                <Overlay.DropdownMenuItem
                  tone="danger"
                  onSelect={() => {
                    if (window.confirm(t("channel.closeConfirm"))) runAction(() => closeChannelAction(conversation.id));
                  }}
                >
                  <Trash2 aria-hidden />
                  {t("channel.close")}
                </Overlay.DropdownMenuItem>
              </>
            ) : conversation.type !== "direct" && !isSupport ? (
              <>
                <Overlay.DropdownMenuSeparator />
                <Overlay.DropdownMenuItem tone="danger" onSelect={() => runAction(() => removeGroupMemberAction(conversation.id, currentUserId))}>
                  <LogOut aria-hidden />
                  {isChannel ? t("channel.unfollow") : t("leave")}
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
              <li key={p.id}>
                <button type="button" onClick={() => void jumpTo(p.id)} className="block w-full truncate text-start text-sm text-ink hover:underline">
                  <span className="font-medium">{senderName(p)}:</span> {p.content}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          data-wallpaper={wallpaper}
          className="chat-wall absolute inset-0 overflow-y-auto overscroll-contain px-2.5 py-3 sm:px-[6%]"
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
              const showSender = !mine && conversation.type !== "direct" && !isChannel && firstOfRun;
              const reply = m.reply_to_id ? byId.get(m.reply_to_id) : undefined;
              const canEdit = mine && !m.is_deleted && m.type === "text" && now - new Date(m.created_at).getTime() < EDIT_WINDOW_MS;
              const canPin = !m.is_deleted && (conversation.type === "direct" || myRole === "admin");
              const isPhoto = !m.is_deleted && m.type === "image" && m.media_path !== null;
              const isFile = !m.is_deleted && m.type === "file" && m.media_path !== null;
              const isVoice = !m.is_deleted && m.type === "audio" && m.media_path !== null;
              const settled = !m.is_deleted && !m.pending && !m.failed;
              const reactions: Reaction[] = m.reactions ?? [];
              const myReaction = reactions.find((r) => r.user_id === currentUserId)?.emoji ?? null;
              // Time, marks and ticks: after the words, or over the corner of a
              // photo that has none.
              const meta = (onPhoto: boolean) => (
                <span
                  className={cn(
                    "flex items-center gap-1 text-[0.6875rem] leading-none tabular",
                    onPhoto
                      ? "absolute bottom-1.5 end-1.5 rounded-full bg-black/45 px-2 py-1 text-white backdrop-blur-[2px]"
                      : isVoice
                        ? "chat-meta absolute bottom-1.5 end-2.5"
                        : cn("chat-meta float-end ms-2 mt-1.5 translate-y-0.5", (isPhoto || isFile) && "me-1 mb-0.5")
                  )}
                >
                  {m.is_pinned ? <Pin className="size-3" aria-label={t("pinnedMessage")} /> : null}
                  {m.is_favorite ? <Star className="size-3 fill-current" aria-label={t("favorite")} /> : null}
                  {m.is_edited && !m.is_deleted ? <span>{t("edited")}</span> : null}
                  <time dateTime={m.created_at}>{formatClock(m.created_at, locale, timeZone)}</time>
                  {mine && !m.is_deleted && !broadcast ? (
                    <Receipt message={m} readAt={othersReadAt} deliveredAt={othersDeliveredAt} labels={receiptLabels} onRetry={retry} />
                  ) : null}
                </span>
              );

              return (
                <Fragment key={m.id}>
                  {showDay ? (
                    <li className="sticky top-0 z-[2] py-2 text-center">
                      <span className="rounded-lg bg-[var(--chat-notice)] px-3 py-1 text-[0.6875rem] font-medium uppercase tracking-wide text-ink-secondary shadow-xs">
                        {formatDate(m.created_at, locale, timeZone)}
                      </span>
                    </li>
                  ) : null}
                  <li
                    id={`message-${m.id}`}
                    className={cn("chat-row group flex scroll-my-24", mine ? "justify-end" : "justify-start", firstOfRun && "pt-1.5", flash === m.id && "chat-flash")}
                  >
                    <MessageGestures
                      enabled={settled && canPost && !iBlockedOther}
                      onReply={() => startReply(m)}
                      onHold={() => setMenuFor(m.id)}
                      className="max-w-[88%] sm:max-w-[72%]"
                    >
                      <div className={cn("flex items-end gap-1", mine && "flex-row-reverse")}>
                        <div className="flex min-w-0 flex-col">
                          <div
                            // A caption wraps to the photo's width, not the other way round.
                            style={isPhoto ? { maxWidth: photoBox(m.media_width, m.media_height).width + 8 } : undefined}
                            className={cn(
                              "chat-bubble min-w-0",
                              isPhoto || isFile ? "p-1" : isVoice ? "px-2 pb-1.5 pt-1.5" : "px-2.5 pb-1 pt-1.5",
                              mine ? "chat-bubble-mine" : "chat-bubble-theirs",
                              firstOfRun && (mine ? "chat-tail-mine" : "chat-tail-theirs"),
                              m.is_deleted && "italic text-ink-muted"
                            )}
                          >
                            {showSender ? (
                              <button
                                type="button"
                                onClick={() => openCard(m.sender_id)}
                                className={cn("mb-0.5 block max-w-full truncate text-start text-[0.8em] font-semibold text-brand-text-strong hover:underline", (isPhoto || isFile) && "px-1.5 pt-0.5")}
                              >
                                {senderName(m)}
                              </button>
                            ) : null}
                            {reply || m.reply_to_id ? (
                              <button
                                type="button"
                                onClick={() => m.reply_to_id && void jumpTo(m.reply_to_id)}
                                className={cn(
                                  "chat-quote mb-1 block w-full min-w-0 rounded-md border-s-4 border-brand-500 bg-[var(--chat-quote)] px-2 py-1 text-start text-[0.8em] transition-colors",
                                  (isPhoto || isFile) && "mx-0.5 w-[calc(100%-0.25rem)]"
                                )}
                              >
                                {reply ? (
                                  <>
                                    <span className="block truncate font-semibold text-brand-text-strong">
                                      {reply.sender_id === currentUserId ? t("you") : senderName(reply)}
                                    </span>
                                    <span className="block truncate text-ink-secondary">{gist(reply)}</span>
                                  </>
                                ) : (
                                  <span className="block truncate text-ink-secondary">{t("replyEarlier")}</span>
                                )}
                              </button>
                            ) : null}
                            {m.is_deleted ? (
                              <p className="inline">{t("deletedMessage")}</p>
                            ) : m.type === "location" && m.location_lat !== null && m.location_lng !== null ? (
                              <LocationCard lat={Number(m.location_lat)} lng={Number(m.location_lng)} label={m.content} openLabel={t("openMap")} title={t("locationShort")} />
                            ) : isPhoto ? (
                              <ChatPhoto message={m} owner={currentUserId} label={t("viewPhoto")} onOpen={(src) => openPhoto(m, src)} overlay={m.content ? null : meta(true)} />
                            ) : isFile ? (
                              <FileCard
                                message={m}
                                locale={locale}
                                labels={{ download: t("downloadFile"), failed: t("downloadFailed") }}
                                onError={() => toast("danger", t("downloadFailed"))}
                              />
                            ) : isVoice ? (
                              <VoiceNote message={m} mine={mine} labels={{ play: t("play"), pause: t("pause") }} />
                            ) : (
                              <MessageText text={m.content} />
                            )}
                            {(isPhoto || isFile) && m.content ? <MessageText text={m.content} className="px-1.5 pt-1" /> : null}
                            {isPhoto && !m.content ? null : meta(false)}
                          </div>
                          {reactions.length > 0 ? (
                            <ReactionsPill
                              reactions={reactions}
                              mine={mine}
                              currentUserId={currentUserId}
                              nameOf={nameOf}
                              labels={{ title: t("reactions"), you: t("you"), tapToRemove: t("tapToRemove") }}
                              onRemove={() => react(m, null)}
                            />
                          ) : null}
                        </div>
                        {settled ? (
                          <Overlay.DropdownMenu open={menuFor === m.id} onOpenChange={(open) => setMenuFor(open ? m.id : null)}>
                            <Overlay.DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="chat-more mb-1 rounded-full p-1 text-ink-muted opacity-100 hover:bg-surface/70 hover:text-ink focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 data-[state=open]:opacity-100"
                                aria-label={t("messageActions")}
                              >
                                <EllipsisVertical className="size-4" aria-hidden />
                              </button>
                            </Overlay.DropdownMenuTrigger>
                            <Overlay.DropdownMenuContent align={mine ? "end" : "start"}>
                              {!iBlockedOther ? <ReactionBar chosen={myReaction} onPick={(emoji) => react(m, emoji)} moreLabel={t("moreReactions")} /> : null}
                              {canPost ? (
                                <Overlay.DropdownMenuItem onSelect={() => startReply(m)}>
                                  <CornerUpLeft aria-hidden />
                                  {t("reply")}
                                </Overlay.DropdownMenuItem>
                              ) : null}
                              {isFile && m.media_path ? (
                                <Overlay.DropdownMenuItem
                                  onSelect={() => {
                                    const path = m.media_path!;
                                    void downloadLink(path, m.media_name ?? "file").then((url) => {
                                      if (url) window.location.assign(url);
                                      else toast("danger", t("downloadFailed"));
                                    });
                                  }}
                                >
                                  <Download aria-hidden />
                                  {t("downloadFile")}
                                </Overlay.DropdownMenuItem>
                              ) : null}
                              {m.content || m.type === "location" ? (
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
                              ) : null}
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
                                <Overlay.DropdownMenuItem onSelect={() => { setReplyTo(null); setEditing(m); draft.set(m.content); inputRef.current?.focus(); }}>
                                  <Pencil aria-hidden />
                                  {tRoot("common.edit")}
                                </Overlay.DropdownMenuItem>
                              ) : null}
                              <Overlay.DropdownMenuSeparator />
                              <Overlay.DropdownMenuItem
                                onSelect={() =>
                                  runAction(
                                    () => deleteMessageAction(m.id, "me"),
                                    () => {
                                      setMessages((c) => c.filter((x) => x.id !== m.id));
                                      void forgetMessages(currentUserId, [m.id]);
                                    }
                                  )
                                }
                              >
                                <Trash2 aria-hidden />
                                {t("deleteForMe")}
                              </Overlay.DropdownMenuItem>
                              {mine ? (
                                <Overlay.DropdownMenuItem
                                  tone="danger"
                                  onSelect={() =>
                                    runAction(
                                      () => deleteMessageAction(m.id, "everyone"),
                                      () => {
                                        // The row has let go of the file; the file goes with it.
                                        if (m.media_path) removeMedia(m.media_path);
                                        upsert({ ...m, is_deleted: true, content: "", ...EMPTIED });
                                      }
                                    )
                                  }
                                >
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
                    </MessageGestures>
                  </li>
                </Fragment>
              );
            })}
          </ol>
        </div>
        {showJump ? (
          <button
            type="button"
            onClick={toLatest}
            aria-label={t("jumpToLatest")}
            className="chat-jump absolute bottom-3 end-3 z-[3] inline-flex size-10 items-center justify-center rounded-full shadow-md transition-transform active:scale-95"
          >
            <ChevronDown className="size-5" aria-hidden />
            {unseen > 0 ? (
              <span className="absolute -top-1.5 -end-1 inline-flex min-w-5 items-center justify-center rounded-full bg-success-600 px-1 text-[0.6875rem] font-bold leading-5 text-white tabular">
                {unseen > 99 ? "99+" : unseen}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>

      <footer className="chat-composer px-2 py-2 sm:px-3">
        {iBlockedOther ? (
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1 text-sm text-ink-secondary">
            <span>{t("youBlocked")}</span>
            <Button variant="secondary" size="sm" onClick={() => other && runAction(() => setBlockedAction(other.user_id, false), () => router.refresh())}>
              {t("unblock")}
            </Button>
          </div>
        ) : !canPost && isChannel ? (
          <div className="flex justify-center py-0.5">
            <button
              type="button"
              onClick={() => runAction(() => setMutedAction(conversation.id, !conversation.isMuted), () => router.refresh())}
              className="chat-channel-mute inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold"
            >
              {conversation.isMuted ? <Bell className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}
              {conversation.isMuted ? t("unmute") : t("mute")}
            </button>
          </div>
        ) : !canPost ? (
          <p className="px-2 py-1 text-sm text-ink-muted">{t("readOnlyChannel")}</p>
        ) : voice.recording ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={voice.cancel}
              aria-label={t("cancelRecording")}
              title={t("cancelRecording")}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-danger-600 transition-colors hover:bg-danger-600/10"
            >
              <Trash2 className="size-5" aria-hidden />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-3xl bg-surface px-4 py-2.5 shadow-xs ring-1 ring-line/60" role="status">
              <span className="chat-rec-dot size-2.5 shrink-0 rounded-full bg-danger-600" aria-hidden />
              <span className="text-[0.9375rem] font-medium text-ink tabular">{formatDuration(voice.elapsed)}</span>
              <span className="chat-rec-wave flex h-5 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden>
                {Array.from({ length: 24 }, (_, index) => (
                  <span key={index} style={{ animationDelay: `${(index % 8) * 90}ms` }} />
                ))}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void finishRecording()}
              aria-label={t("sendVoice")}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-solid text-brand-on-solid shadow-sm transition-[transform,background-color] hover:bg-brand-solid-hover active:scale-95"
            >
              <SendHorizontal className="size-5" aria-hidden />
            </button>
          </div>
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
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-brand-text-strong">
                    {editing ? t("editing") : t("replyingTo", { name: replyTo!.sender_id === currentUserId ? t("you") : senderName(replyTo!) })}
                  </span>
                  {replyTo ? <span className="block truncate text-xs text-ink-muted">{gist(replyTo)}</span> : null}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (editing) draft.set("");
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
            {attached || preparing ? (
              <div className="chat-attachment mb-1.5 flex items-center gap-3 rounded-2xl bg-surface p-1.5 pe-3 shadow-xs ring-1 ring-line/60">
                {attached?.kind === "photo" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local blob of the photo about to be sent
                  <img src={attached.image.previewUrl} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
                ) : attached?.kind === "file" ? (
                  <span className={cn("inline-flex size-14 shrink-0 items-center justify-center rounded-xl text-white", FILE_TINT[attachedFileKind ?? "doc"])}>
                    <FileText className="size-6" aria-hidden />
                  </span>
                ) : (
                  <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-ink-muted">
                    <LoaderCircle className="size-5 animate-spin" aria-hidden />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{attached?.kind === "file" ? attached.name : t("photo")}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {preparing
                      ? t("photoPreparing")
                      : attached?.kind === "file"
                        ? `${formatBytes(attached.size, locale)} · ${t("fileCaptionHint")}`
                        : t("photoCaptionHint")}
                  </span>
                </span>
                {attached ? (
                  <button
                    type="button"
                    onClick={() => replaceAttachment(null)}
                    className="rounded-full p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink"
                    aria-label={attached.kind === "file" ? t("removeFile") : t("removePhoto")}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="flex items-end gap-1.5">
              <div className="flex min-w-0 flex-1 items-end rounded-3xl bg-surface px-1 shadow-xs ring-1 ring-line/60">
                {!editing ? (
                  <Overlay.DropdownMenu>
                    <Overlay.DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={preparing || locating}
                        aria-label={t("attach")}
                        title={t("attach")}
                        className="my-1 ms-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-muted hover:text-brand-text disabled:animate-pulse data-[state=open]:text-brand-text"
                      >
                        <Paperclip className="size-5 -rotate-45" aria-hidden />
                      </button>
                    </Overlay.DropdownMenuTrigger>
                    <Overlay.DropdownMenuContent align="start">
                      <Overlay.DropdownMenuItem onSelect={() => fileRef.current?.click()}>
                        <span className="chat-attach-icon bg-[#7c5cff]"><FileText aria-hidden /></span>
                        {t("attachDocument")}
                      </Overlay.DropdownMenuItem>
                      <Overlay.DropdownMenuItem onSelect={() => photoRef.current?.click()}>
                        <span className="chat-attach-icon bg-[#1f8ef1]"><ImagePlus aria-hidden /></span>
                        {t("attachGallery")}
                      </Overlay.DropdownMenuItem>
                      <Overlay.DropdownMenuItem onSelect={() => cameraRef.current?.click()}>
                        <span className="chat-attach-icon bg-[#e5484d]"><Camera aria-hidden /></span>
                        {t("attachCamera")}
                      </Overlay.DropdownMenuItem>
                      <Overlay.DropdownMenuItem onSelect={() => void shareLocation()}>
                        <span className="chat-attach-icon bg-[#16a34a]"><MapPin aria-hidden /></span>
                        {t("sendLocation")}
                      </Overlay.DropdownMenuItem>
                    </Overlay.DropdownMenuContent>
                  </Overlay.DropdownMenu>
                ) : null}
                <input
                  ref={photoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  tabIndex={-1}
                  onChange={(event) => {
                    attachAny(event.target.files?.[0]);
                    // The same file picked twice in a row is still a change.
                    event.target.value = "";
                  }}
                />
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  tabIndex={-1}
                  onChange={(event) => {
                    attachAny(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept={FILE_ACCEPT}
                  className="hidden"
                  tabIndex={-1}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) attachFile(file);
                    event.target.value = "";
                  }}
                />
                <label htmlFor="message-input" className="sr-only">
                  {t("composer")}
                </label>
                <textarea
                  id="message-input"
                  ref={inputRef}
                  rows={1}
                  defaultValue=""
                  onChange={(e) => {
                    draft.typed(e.target.value);
                    if (e.target.value.trim()) announceTyping("typing");
                  }}
                  onKeyDown={onKeyDown}
                  onPaste={(event) => {
                    if (editing) return;
                    const file = [...event.clipboardData.files][0];
                    if (!file) return;
                    event.preventDefault();
                    attachAny(file);
                  }}
                  maxLength={MESSAGE_MAX_LENGTH}
                  placeholder={attached ? t("photoCaption") : t("composerPlaceholder")}
                  className="field-sizing-content max-h-36 min-h-11 w-full min-w-0 resize-none bg-transparent px-2 py-2.5 text-[length:var(--chat-text,16px)] leading-[1.45] text-ink placeholder:text-ink-muted focus:outline-none"
                  aria-describedby="message-hint"
                />
              </div>
              <ComposerAction
                draft={draft}
                editing={Boolean(editing)}
                attached={Boolean(attached)}
                recordable={recordable}
                saving={saving}
                onRecord={() => void startRecording()}
                labels={{ record: t("recordVoice"), send: t("send"), save: tRoot("common.save") }}
              />
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

      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} labels={{ close: tRoot("common.close"), download: t("downloadPhoto") }} />
      <MemberCardDialog
        seed={cardFor}
        onClose={() => setCardFor(null)}
        canMessage={canMessage && cardFor?.userId !== currentUserId}
        hideMessage={cardFor !== null && cardFor.userId === other?.user_id}
      />
      <WallpaperDialog
        open={wallpaperOpen}
        onOpenChange={setWallpaperOpen}
        labels={{ title: t("wallpaper"), description: t("wallpaperDescription"), close: tRoot("common.close"), names: wallpaperNames }}
      />
      <TextSizeDialog
        open={textSizeOpen}
        onOpenChange={setTextSizeOpen}
        labels={{
          title: t("textSize.title"),
          description: t("textSize.description"),
          close: tRoot("common.close"),
          sample: t("textSize.sample"),
          names: { small: t("textSize.small"), medium: t("textSize.medium"), large: t("textSize.large"), xlarge: t("textSize.xlarge") },
        }}
      />

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

const FILE_TINT: Record<string, string> = {
  pdf: "bg-[#e5484d]",
  doc: "bg-[#2f6fed]",
  sheet: "bg-[#16a34a]",
  slides: "bg-[#f97316]",
  text: "bg-[#64748b]",
  archive: "bg-[#a16207]",
  audio: "bg-[#8b5cf6]",
  video: "bg-[#db2777]",
  image: "bg-[#0d9488]",
};

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

/** The composer's text, kept where typing does not render the thread. */
interface Draft {
  get(): string;
  /** Replaces the text, in the box as well: clearing after a send, loading a message to edit. */
  set(value: string): void;
  /** What the box itself reports as somebody types. */
  typed(value: string): void;
  subscribe(listener: () => void): () => void;
}

function useDraft(input: RefObject<HTMLTextAreaElement | null>, key: string): Draft {
  const [draft] = useState<Draft>(() => {
    // What was being written here before — the conversation left, the app
    // closed — is there again (forget.ts empties it on signing out).
    let text = "";
    try {
      text = localStorage.getItem(key) ?? "";
    } catch {
      text = "";
    }
    let saving = 0;
    const save = () => {
      window.clearTimeout(saving);
      saving = window.setTimeout(() => {
        try {
          if (text.trim()) localStorage.setItem(key, text);
          else localStorage.removeItem(key);
        } catch {
          // Kept while the conversation is open all the same.
        }
      }, 250);
    };
    const listeners = new Set<() => void>();
    const changed = () => {
      save();
      for (const listener of listeners) listener();
    };
    return {
      get: () => text,
      set(value) {
        text = value;
        const box = input.current;
        if (box && box.value !== value) box.value = value;
        changed();
      },
      typed(value) {
        text = value;
        changed();
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  });
  return draft;
}

/**
 * Keeps the draft in step with the box however the phone's keyboard delivers
 * its letters.
 *
 * React hears the box through "input" events, and a browser sends one per
 * letter. Some Android keyboards in a web view do not: a word still being
 * composed can reach the box through composition or key events alone, and the
 * send button then waited for the next "input" to appear — seconds, or the
 * next space. Every other event a letter can arrive by is listened to as well,
 * and while the box has focus it is also looked at five times a second, which
 * costs nothing when nothing changed.
 */
function useKeyboardSync(input: RefObject<HTMLTextAreaElement | null>, draft: Draft) {
  useEffect(() => {
    // On the document, because the box itself comes and goes (a voice note
    // being recorded takes its place).
    const sync = () => {
      const box = input.current;
      if (box && box.value !== draft.get()) draft.typed(box.value);
    };
    const mine = (event: Event) => event.target === input.current;
    const onEvent = (event: Event) => {
      if (mine(event)) sync();
    };
    const events = ["input", "keyup", "compositionstart", "compositionupdate", "compositionend", "textInput", "paste", "cut"] as const;
    for (const name of events) document.addEventListener(name, onEvent, true);
    let timer: number | null = null;
    const onFocus = (event: FocusEvent) => {
      if (mine(event) && timer === null) timer = window.setInterval(sync, 200);
    };
    const onBlur = (event: FocusEvent) => {
      if (!mine(event)) return;
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      sync();
    };
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    if (input.current && document.activeElement === input.current) timer = window.setInterval(sync, 200);
    return () => {
      for (const name of events) document.removeEventListener(name, onEvent, true);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      if (timer !== null) window.clearInterval(timer);
    };
  }, [input, draft]);
}

/**
 * The round button at the end of the composer: the microphone while the box
 * is empty, the arrow the moment there is a letter in it, and back again the
 * moment it is empty. The only part of the conversation that re-renders as
 * somebody types.
 */
function ComposerAction({
  draft,
  editing,
  attached,
  recordable,
  saving,
  onRecord,
  labels,
}: {
  draft: Draft;
  editing: boolean;
  attached: boolean;
  recordable: boolean;
  saving: boolean;
  onRecord: () => void;
  labels: { record: string; send: string; save: string };
}) {
  const hasText = useSyncExternalStore(draft.subscribe, () => draft.get().trim().length > 0, () => false);
  const round =
    "inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-solid text-brand-on-solid shadow-sm transition-[transform,background-color] hover:bg-brand-solid-hover active:scale-95";
  if (!editing && !hasText && !attached && recordable) {
    return (
      <button type="button" onClick={onRecord} aria-label={labels.record} title={labels.record} className={round}>
        <Mic className="size-5" aria-hidden />
      </button>
    );
  }
  return (
    <button
      type="submit"
      disabled={editing ? !hasText || saving : !hasText && !attached}
      aria-label={editing ? labels.save : labels.send}
      className={cn(round, "disabled:opacity-50")}
    >
      {editing ? <Check className="size-5" aria-hidden /> : <SendHorizontal className="size-5" aria-hidden />}
    </button>
  );
}

/**
 * The mark after one's own message (ticks.tsx): a clock while it is on its
 * way, one tick once the server has it, two once it has reached the others,
 * two blue ones once they have read it — everyone else in a group, the other
 * side of a support conversation. A message that did not make it is marked in
 * red, and tapping the mark sends it again.
 *
 * `readAt` and `deliveredAt` are single moments worked out once per
 * conversation, so the comparison is one number against one number however
 * many people are in the room.
 */
function Receipt({
  message,
  readAt,
  deliveredAt,
  labels,
  onRetry,
}: {
  message: ThreadMessage;
  readAt: number | null;
  deliveredAt: number | null;
  labels: { sending: string; sent: string; delivered: string; seen: string; failed: string };
  onRetry: (message: ThreadMessage) => void;
}) {
  if (message.failed) {
    return (
      <button type="button" onClick={() => onRetry(message)} title={labels.failed} aria-label={labels.failed} className="text-danger-600 hover:text-danger-700">
        <TriangleAlert className="size-3.5" aria-hidden />
      </button>
    );
  }
  if (message.pending) return <Ticks state="sending" label={labels.sending} />;
  const state = tickState(message.created_at, deliveredAt, readAt);
  return <Ticks state={state} label={state === "read" ? labels.seen : state === "delivered" ? labels.delivered : labels.sent} />;
}

/**
 * The name and face at the top of the conversation: a button when there is a
 * person behind them to show, plain otherwise.
 */
function HeaderIdentity({ person, onOpen, label, children }: { person: string | undefined; onOpen: () => void; label: string; children: ReactNode }) {
  if (!person) return <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={label}
      className="-my-1 flex min-w-0 flex-1 items-center gap-2 rounded-xl py-1 pe-2 text-start transition-colors hover:bg-surface-muted/70"
    >
      {children}
    </button>
  );
}

/** The box a photo is drawn in, from its own shape, before a pixel has arrived. */
const PHOTO_MAX_WIDTH = 280;
const PHOTO_MAX_HEIGHT = 340;
const PHOTO_MIN_WIDTH = 160;
function photoBox(width: number | null, height: number | null): { width: number; height: number } {
  const w = width && width > 0 ? width : 4;
  const h = height && height > 0 ? height : 3;
  let boxWidth = Math.max(PHOTO_MIN_WIDTH, Math.min(PHOTO_MAX_WIDTH, w));
  let boxHeight = (boxWidth * h) / w;
  if (boxHeight > PHOTO_MAX_HEIGHT) {
    boxHeight = PHOTO_MAX_HEIGHT;
    boxWidth = Math.max(PHOTO_MIN_WIDTH, (PHOTO_MAX_HEIGHT * w) / h);
  }
  return { width: Math.round(boxWidth), height: Math.round(boxHeight) };
}

/**
 * A photo in a bubble.
 *
 * Its box is the photo's own shape from the moment the bubble appears, so the
 * conversation does not jump when the picture arrives. The copy on this device
 * is shown while the upload is on its way. After that, the bytes kept on the
 * device (sent from here, or downloaded once: local-store.ts) come first, with
 * no line too; only a photo not kept yet asks for a signed link — together
 * with every other photo on screen — and is kept once it has come. While it
 * comes, the box says so.
 */
function ChatPhoto({ message, owner, label, onOpen, overlay }: { message: ThreadMessage; owner: string; label: string; onOpen: (src: string) => void; overlay: ReactNode }) {
  const path = message.media_path ?? null;
  const [kept, setKept] = useState<{ path: string; url: string | null } | null>(null);
  useEffect(() => {
    if (message.local_preview || !path) return;
    let live = true;
    let url: string | null = null;
    void keptPhoto(owner, path).then((blob) => {
      if (!live) return;
      url = blob ? URL.createObjectURL(blob) : null;
      setKept({ path, url });
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [owner, path, message.local_preview]);
  const looked = kept?.path === path;
  const keptUrl = looked ? kept.url : null;
  const remote = useSignedUrl(message.local_preview || !looked || keptUrl ? null : path);
  const src = message.local_preview ?? keptUrl ?? remote;
  const [loaded, setLoaded] = useState<string | null>(null);
  const box = photoBox(message.media_width, message.media_height);
  // Downloaded: kept, so the next time it is there at once.
  const keepDownloaded = (url: string) => {
    if (!path || url !== remote) return;
    void fetch(url)
      .then((answer) => (answer.ok ? answer.blob() : null))
      .then((blob) => (blob && blob.size > 0 ? keepPhoto(owner, path, blob) : undefined))
      .catch(() => undefined);
  };
  const coming = !message.pending && !message.failed && (!src || (loaded !== src && !src.startsWith("blob:")));
  return (
    <button
      type="button"
      onClick={() => src && onOpen(src)}
      aria-label={label}
      className="chat-photo relative block max-w-full overflow-hidden rounded-[0.45rem]"
      style={{ width: box.width, aspectRatio: `${box.width} / ${box.height}` }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link or a local blob; nothing for the optimiser to cache
        <img
          src={src}
          alt=""
          decoding="async"
          loading="lazy"
          // A picture already in the cache can finish before React is
          // listening; the ref catches that one, onLoad every other.
          ref={(img) => {
            if (img?.complete && img.naturalWidth > 0 && loaded !== src) {
              setLoaded(src);
              keepDownloaded(src);
            }
          }}
          onLoad={() => {
            setLoaded(src);
            keepDownloaded(src);
          }}
          className={cn("size-full object-cover transition-opacity duration-300", loaded === src || src.startsWith("blob:") ? "opacity-100" : "opacity-0")}
        />
      ) : null}
      {coming ? (
        <span className="absolute inset-0 flex items-center justify-center" data-photo-coming="">
          <LoaderCircle className="size-7 animate-spin text-ink-muted" aria-hidden />
        </span>
      ) : null}
      {message.pending ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/20">
          <span className="inline-flex size-11 items-center justify-center rounded-full bg-black/45 text-white">
            <LoaderCircle className="size-6 animate-spin" aria-hidden />
          </span>
        </span>
      ) : null}
      {overlay}
    </button>
  );
}
