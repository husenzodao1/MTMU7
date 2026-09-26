"use client";

import {
  ArrowLeft,
  Ban,
  Bell,
  BellOff,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
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
  Mic,
  Minimize2,
  Palette,
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
import { MessageGestures } from "@/features/messages/gestures";
import { GroupMembersDialog } from "@/features/messages/group-members";
import { downloadLink, mediaPath, prepareImage, removeMedia, uploadImage, uploadMedia, useSignedUrl, type PreparedImage } from "@/features/messages/media";
import { MemberCardDialog, type MemberCardSeed } from "@/features/messages/member-card";
import { PhotoViewer, type ViewedPhoto } from "@/features/messages/photo-viewer";
import { canRecord, useVoiceRecorder, type Recording } from "@/features/messages/recorder";
import { useWallpaper, WallpaperDialog, WALLPAPERS, type Wallpaper } from "@/features/messages/wallpaper";
import { announceMessage } from "@/features/push/client";
import { dbErrorKey } from "@/lib/actions/db-error-key";
import { EDIT_WINDOW_MS, MESSAGE_MAX_LENGTH, REPORT_REASONS, type ConversationMember, type Reaction, type ThreadMessage } from "@/features/messages/types";
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

function sortAsc(list: ThreadMessage[]): ThreadMessage[] {
  return [...list].sort((a, b) => (a.created_at === b.created_at ? a.id.localeCompare(b.id) : a.created_at.localeCompare(b.created_at)));
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

  const [messages, setMessages] = useState<ThreadMessage[]>(() => sortAsc(initialMessages));
  const [hasMore, setHasMore] = useState(initialMessages.length >= 50);
  const [pinned, setPinned] = useState(initialPinned);
  const [replyTo, setReplyTo] = useState<ThreadMessage | null>(null);
  const [editing, setEditing] = useState<ThreadMessage | null>(null);
  const [reporting, setReporting] = useState<ThreadMessage | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [wallpaper] = useWallpaper();
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
  const draft = useDraft(inputRef);
  const preserveScroll = useRef<number | null>(null);
  const stickToBottom = useRef(true);
  const farFromBottom = useRef(false);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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
   * Row level security and the guard trigger decide whether it may be written,
   * exactly as they did when this went through a Server Action — the portal's
   * own server added a round trip and nothing else. The push to everybody
   * else is asked for once the row exists.
   */
  const deliver = useCallback(
    (local: ThreadMessage) => {
      upsert(local);
      // A photo, file or recording starts uploading now, alongside whatever
      // is ahead of it in the queue, and its message waits in line only for
      // the insert.
      const photo = local.type === "image" ? photos.current.get(local.id) : undefined;
      const blob = local.type === "file" || local.type === "audio" ? blobs.current.get(local.id) : undefined;
      const uploaded = local.media_path
        ? photo
          ? uploadImage(local.media_path, photo)
          : blob
            ? uploadMedia(local.media_path, blob.blob, blob.mime)
            : null
        : null;
      queue.current = queue.current.then(async () => {
        if (local.media_path && !(await uploaded)) {
          setMessages((current) => current.map((m) => (m.id === local.id ? { ...m, pending: false, failed: true } : m)));
          fail(local.type === "audio" ? "portal.messages.voiceFailed" : local.type === "file" ? "portal.messages.fileFailed" : "portal.messages.photoFailed");
          return;
        }
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
            media_path: local.media_path,
            media_width: local.media_width,
            media_height: local.media_height,
            media_name: local.media_name ?? null,
            media_size: local.media_size ?? null,
            media_mime: local.media_mime ?? null,
            media_duration: local.media_duration ?? null,
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
        photos.current.delete(local.id);
        blobs.current.delete(local.id);
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

  const retry = useCallback(
    (failed: ThreadMessage) => {
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
  const typingChannel = useRef<RealtimeChannel | null>(null);
  const lastTypingSent = useRef(0);
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`chat:${conversation.id}`, { config: { private: true, broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const said = payload as { user_id?: unknown; kind?: unknown };
        if (typeof said.user_id !== "string" || said.user_id === currentUserId) return;
        const who = said.user_id;
        const kind = said.kind === "recording" ? "recording" : "typing";
        setTypingNow((current) => ({ ...current, [who]: { kind, until: Date.now() + 5000 } }));
      })
      .subscribe();
    typingChannel.current = channel;
    const sweep = window.setInterval(() => {
      setTypingNow((current) => {
        const at = Date.now();
        const live = Object.entries(current).filter(([, value]) => value.until > at);
        return live.length === Object.keys(current).length ? current : Object.fromEntries(live);
      });
    }, 1000);
    return () => {
      window.clearInterval(sweep);
      typingChannel.current = null;
      void supabase.removeChannel(channel);
    };
  }, [conversation.id, currentUserId]);

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
        const label = draft.get().trim().slice(0, 200);
        draft.set("");
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
  };

  const toLatest = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setUnseen(0);
  };

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
          // Our own message, back from realtime before the insert answered:
          // it takes the place of the bubble already on screen instead of
          // standing beside it until the answer arrives.
          setMessages((current) => {
            if (current.some((m) => m.id === row.id)) return current;
            const local = current.find((m) =>
              m.pending && (row.media_path ? m.media_path === row.media_path : m.content === row.content && m.type === row.type)
            );
            const arrived: ThreadMessage = {
              ...row,
              sender_first_name: sender?.first_name ?? null,
              sender_last_name: sender?.last_name ?? null,
              sender_avatar_url: sender?.avatar_url ?? null,
              is_favorite: false,
              reactions: [],
              // The photo or recording already on this device stays, rather
              // than blinking out while a link to the uploaded copy is fetched.
              local_preview: local?.local_preview,
            };
            return sortAsc(local ? current.map((m) => (m.id === local.id ? arrived : m)) : [...current, arrived]);
          });
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
            reactions: [],
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
  }, [conversation.id, currentUserId, upsert, applyReaction]);

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
    [conversation.id, t, toast]
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
  const subtitle =
    typingLine ?? conversation.subtitle ?? (conversation.type !== "direct" && !isSupport ? t("memberCount", { count: members.length }) : undefined);
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
            <Avatar name={conversation.title} src={other?.avatar_url} size="md" />
          ) : (
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-secondary" aria-hidden>
              <Users className="size-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[0.9375rem] font-semibold leading-tight text-ink">{conversation.title}</h1>
            {subtitle ? (
              <p className={cn("truncate text-xs", typingLine ? "font-medium text-success-700" : "text-ink-muted")} aria-live="polite">
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
              const showSender = !mine && conversation.type !== "direct" && firstOfRun;
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
                  {mine && !m.is_deleted ? <Receipt message={m} seenAt={othersReadAt} labels={receiptLabels} onRetry={retry} /> : null}
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
                              "chat-bubble min-w-0 text-sm",
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
                                className={cn("mb-0.5 block max-w-full truncate text-start text-xs font-semibold text-brand-text-strong hover:underline", (isPhoto || isFile) && "px-1.5 pt-0.5")}
                              >
                                {senderName(m)}
                              </button>
                            ) : null}
                            {reply || m.reply_to_id ? (
                              <button
                                type="button"
                                onClick={() => m.reply_to_id && void jumpTo(m.reply_to_id)}
                                className={cn(
                                  "chat-quote mb-1 block w-full min-w-0 rounded-md border-s-4 border-brand-500 bg-[var(--chat-quote)] px-2 py-1 text-start text-xs transition-colors",
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
                              <ChatPhoto message={m} label={t("viewPhoto")} onOpen={(src) => openPhoto(m, src)} overlay={m.content ? null : meta(true)} />
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
                              <Overlay.DropdownMenuItem onSelect={() => runAction(() => deleteMessageAction(m.id, "me"), () => setMessages((c) => c.filter((x) => x.id !== m.id)))}>
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
                      <Overlay.DropdownMenuItem onSelect={shareLocation}>
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
                  className="field-sizing-content max-h-36 min-h-11 w-full min-w-0 resize-none bg-transparent px-2 py-2.5 text-[0.9375rem] leading-6 text-ink placeholder:text-ink-muted focus:outline-none"
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

function useDraft(input: RefObject<HTMLTextAreaElement | null>): Draft {
  const [draft] = useState<Draft>(() => {
    let text = "";
    const listeners = new Set<() => void>();
    const changed = () => {
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
 * is shown while the upload is on its way; everybody else gets a signed link,
 * asked for together with every other photo on screen.
 */
function ChatPhoto({ message, label, onOpen, overlay }: { message: ThreadMessage; label: string; onOpen: (src: string) => void; overlay: ReactNode }) {
  const remote = useSignedUrl(message.local_preview ? null : message.media_path);
  const src = message.local_preview ?? remote;
  const [loaded, setLoaded] = useState<string | null>(null);
  const box = photoBox(message.media_width, message.media_height);
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
            if (img?.complete && img.naturalWidth > 0 && loaded !== src) setLoaded(src);
          }}
          onLoad={() => setLoaded(src)}
          className={cn("size-full object-cover transition-opacity duration-300", loaded === src || src.startsWith("blob:") ? "opacity-100" : "opacity-0")}
        />
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
