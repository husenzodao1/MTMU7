"use client";

import { BellOff, Headset, Megaphone, Search, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/misc";
import { ChannelsDialog } from "@/features/messages/channels";
import { NewConversationButton } from "@/features/messages/new-conversation";
import { StoriesRow, type StoryAuthor } from "@/features/messages/stories";
import { Ticks, tickState } from "@/features/messages/ticks";
import { getBrowserClient } from "@/lib/supabase/browser";
import { dayKey, formatClock, formatShortDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { cn } from "@/lib/utils/cn";
import { conversationTitle, isBroadcast, type ConversationMember } from "@/features/messages/types";

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
const time = (value: string) => new Date(value).getTime();
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
  const [base, setBase] = useState(conversations);
  if (base !== conversations) {
    // Fresh rows from the server supersede whatever realtime said before them.
    setBase(conversations);
    setLive({});
    setReadAt({});
    setPeer({});
  }
  const known = useRef(new Set<string>());
  const active = useRef<string | null>(null);
  useEffect(() => {
    known.current = new Set(conversations.map((c) => c.id));
    active.current = activeId;
  }, [conversations, activeId]);

  // Realtime checks every change against every subscriber, so the list asks
  // only about its own conversations — up to the hundred a filter can name —
  // and hears about a new one from its own membership row instead of from
  // every message sent anywhere in the school. The ticks are followed live
  // for one-to-ones only: in a group the mark is the last of everybody to
  // catch up, which one row cannot say, and the thread follows it there.
  const idFilter = useMemo(() => {
    const ids = conversations.map((c) => c.id);
    return ids.length > 0 && ids.length <= 100 ? `conversation_id=in.(${ids.join(",")})` : null;
  }, [conversations]);
  const directFilter = useMemo(() => {
    const ids = conversations.filter((c) => c.type === "direct").map((c) => c.id);
    return ids.length > 0 && ids.length <= 100 ? `conversation_id=in.(${ids.join(",")})` : null;
  }, [conversations]);

  useEffect(() => {
    const supabase = getBrowserClient();
    let channel = supabase
      .channel(`conversation-list:${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_members", filter: `user_id=eq.${currentUserId}` },
        () => {
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => router.refresh(), 400);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation_members", filter: `user_id=eq.${currentUserId}` },
        (payload) => {
          const row = payload.new as { conversation_id: string; last_read_at: string | null };
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
        if (!known.current.has(row.conversation_id)) {
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => router.refresh(), 700);
          return;
        }
        const counts = row.sender_id !== currentUserId && row.conversation_id !== active.current;
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
    channel.subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, router, idFilter, directFilter]);

  const today = dayKey(new Date(), timeZone);
  const merged = useMemo(
    () =>
      conversations.map((c) => {
        const l = live[c.id];
        const read = readAt[c.id];
        // Read since the server counted: everything it counted is read.
        const counted = read !== undefined && (!c.last_message_at || time(c.last_message_at) <= time(read)) ? 0 : c.unread_count;
        const p = peer[c.id];
        const row: ConversationSummary =
          l && (!c.last_message_at || l.created_at > c.last_message_at)
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
        if (p) {
          row.peer_read_at = later(row.peer_read_at, p.read);
          row.peer_delivered_at = later(row.peer_delivered_at, p.delivered);
        }
        const askedByMe = c.type === "support" && c.created_by === currentUserId;
        const title = askedByMe ? t("supportTitle") : conversationTitle(row, currentUserId, t("unknownUser"));
        return { ...row, title, askedByMe };
      }),
    [conversations, live, readAt, peer, currentUserId, t]
  );

  const unreadCount = merged.filter((c) => c.unread_count > 0 && c.id !== activeId).length;
  const hasChannels = merged.some((c) => c.type === "channel");
  const items = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return merged
      .filter((c) => !normalized || c.title.toLowerCase().includes(normalized))
      .filter((c) =>
        filter === "unread"
          ? c.unread_count > 0 && c.id !== activeId
          : filter === "groups"
            ? c.type === "group" || c.type === "class_group" || c.type === "announcement"
            : filter === "channels"
              ? c.type === "channel"
              : true
      )
      .sort((a, b) => (b.last_message_at ?? b.updated_at).localeCompare(a.last_message_at ?? a.updated_at));
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
              {conversations.length === 0
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
              const ticks =
                mine && !broadcast && c.last_message_at
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
                        </span>
                        <time className="msg-time" dateTime={c.last_message_at ?? undefined}>
                          {when}
                        </time>
                      </span>
                      <span className="msg-line">
                        <span className="msg-preview">
                          {ticks ? (
                            <Ticks
                              state={ticks}
                              label={ticks === "read" ? t("receipt.seen") : ticks === "delivered" ? t("receipt.delivered") : t("receipt.sent")}
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

      <NewConversationButton canCreateGroup={canCreateGroup} variant="fab" />
      {channelsEnabled ? <ChannelsDialog open={channelsOpen} onOpenChange={setChannelsOpen} canCreate={canCreateGroup} /> : null}
    </div>
  );
}
