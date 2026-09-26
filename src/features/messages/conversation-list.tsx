"use client";

import { BellOff, Headset, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/misc";
import { getBrowserClient } from "@/lib/supabase/browser";
import { dayKey, formatClock, formatShortDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { cn } from "@/lib/utils/cn";
import { conversationTitle, type ConversationMember } from "@/features/messages/types";

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
}

/** What realtime has said about a conversation since the list was rendered. */
interface Live {
  content: string;
  sender_id: string | null;
  created_at: string;
  type: string;
  unread: number;
}

export function ConversationList({ conversations, currentUserId, timeZone }: { conversations: ConversationSummary[]; currentUserId: string; timeZone: string }) {
  const t = useTranslations("portal.messages");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [filter, setFilter] = useState("");
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
  const [base, setBase] = useState(conversations);
  if (base !== conversations) {
    // Fresh rows from the server supersede whatever realtime said before them.
    setBase(conversations);
    setLive({});
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
  // every message sent anywhere in the school.
  const idFilter = useMemo(() => {
    const ids = conversations.map((c) => c.id);
    return ids.length > 0 && ids.length <= 100 ? `conversation_id=in.(${ids.join(",")})` : null;
  }, [conversations]);

  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`conversation-list:${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_members", filter: `user_id=eq.${currentUserId}` },
        () => {
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => router.refresh(), 400);
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
      })
      .subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, router, idFilter]);

  const today = dayKey(new Date(), timeZone);
  const items = useMemo(() => {
    const normalized = filter.trim().toLowerCase();
    return conversations
      .map((c) => {
        const l = live[c.id];
        const merged: ConversationSummary =
          l && (!c.last_message_at || l.created_at > c.last_message_at)
            ? {
                ...c,
                last_message_content: l.content,
                last_message_sender_id: l.sender_id,
                last_message_at: l.created_at,
                last_message_deleted: false,
                last_message_type: l.type,
                unread_count: c.unread_count + l.unread,
              }
            : c;
        const askedByMe = c.type === "support" && c.created_by === currentUserId;
        const title = askedByMe ? t("supportTitle") : conversationTitle(merged, currentUserId, t("unknownUser"));
        return { ...merged, title, askedByMe };
      })
      .filter((c) => !normalized || c.title.toLowerCase().includes(normalized))
      .sort((a, b) => (b.last_message_at ?? b.updated_at).localeCompare(a.last_message_at ?? a.updated_at));
  }, [conversations, live, currentUserId, filter, t]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line p-3">
        <label htmlFor="conversation-filter" className="sr-only">
          {t("filter")}
        </label>
        <input
          id="conversation-filter"
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("filter")}
          className="block h-9 w-full rounded-md border border-line-strong bg-surface px-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
        />
      </div>
      {items.length === 0 ? (
        <p className="p-4 text-sm text-ink-muted">{conversations.length === 0 ? t("noConversations") : t("noMatches")}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {items.map((c) => {
            const isActive = c.id === activeId;
            const unread = !isActive && c.unread_count > 0;
            const other = c.type === "direct" ? c.members?.find((m) => m.user_id !== currentUserId) : null;
            const preview = c.last_message_at
              ? c.last_message_deleted
                ? t("deletedMessage")
                : `${c.last_message_sender_id === currentUserId ? `${t("you")}: ` : ""}${
                    c.last_message_type === "location"
                      ? `📍 ${c.last_message_content || t("locationShort")}`
                      : c.last_message_type === "image"
                        ? c.last_message_content ? `${t("photo")} · ${c.last_message_content}` : t("photo")
                        : c.last_message_content ?? ""
                  }`
              : t("noMessagesYet");
            const time = c.last_message_at
              ? dayKey(c.last_message_at, timeZone) === today
                ? formatClock(c.last_message_at, locale, timeZone)
                : formatShortDate(c.last_message_at, locale, timeZone)
              : "";
            return (
              <li key={c.id}>
                <Link
                  href={c.askedByMe ? "/support/chat" : `/messages/${c.id}`}
                  aria-current={isActive ? "page" : undefined}
                  className={cn("flex items-center gap-3 border-b border-line px-3 py-3 hover:bg-surface-muted", isActive && "bg-brand-50 hover:bg-brand-50")}
                >
                  {c.type === "support" ? (
                    <span className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-solid text-brand-on-solid" aria-hidden>
                      <Headset className="size-5" />
                    </span>
                  ) : c.type === "direct" ? (
                    <Avatar name={c.title} src={other?.avatar_url} />
                  ) : (
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-secondary" aria-hidden>
                      <Users className="size-5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn("flex min-w-0 items-center gap-1.5 truncate text-sm", unread ? "font-semibold text-ink" : "font-medium text-ink")}>
                        <span className="truncate">{c.title}</span>
                        {c.type === "support" && !c.askedByMe ? (
                          <span className="shrink-0 rounded bg-brand-50 px-1.5 py-px text-[0.625rem] font-semibold uppercase tracking-wide text-brand-text">{t("supportBadge")}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-xs text-ink-muted tabular">{time}</span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", unread ? "text-ink" : "text-ink-muted")}>{preview}</span>
                      {c.is_muted ? <BellOff className="size-3.5 shrink-0 text-ink-muted" aria-label={t("muted")} /> : null}
                      {unread ? (
                        <span className="shrink-0 rounded-full bg-brand-solid px-1.5 text-xs font-semibold leading-5 text-brand-on-solid tabular">
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
  );
}
