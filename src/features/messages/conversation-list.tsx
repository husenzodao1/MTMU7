"use client";

import { BellOff, Users } from "lucide-react";
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
}

export function ConversationList({ conversations, currentUserId, timeZone }: { conversations: ConversationSummary[]; currentUserId: string; timeZone: string }) {
  const t = useTranslations("portal.messages");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeId = pathname.startsWith("/messages/") ? pathname.split("/")[2] : null;

  // New messages in any of the user's conversations (RLS-filtered) refresh the list.
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`conversation-list:${currentUserId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => router.refresh(), 700);
      })
      .subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, router]);

  const today = dayKey(new Date(), timeZone);
  const items = useMemo(() => {
    const normalized = filter.trim().toLowerCase();
    return conversations
      .map((c) => ({ ...c, title: conversationTitle(c, currentUserId, t("unknownUser")) }))
      .filter((c) => !normalized || c.title.toLowerCase().includes(normalized));
  }, [conversations, currentUserId, filter, t]);

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
            const active = c.id === activeId;
            const unread = !active && c.unread_count > 0;
            const other = c.type === "direct" ? c.members?.find((m) => m.user_id !== currentUserId) : null;
            const preview = c.last_message_at
              ? c.last_message_deleted
                ? t("deletedMessage")
                : `${c.last_message_sender_id === currentUserId ? `${t("you")}: ` : ""}${c.last_message_content ?? ""}`
              : t("noMessagesYet");
            const time = c.last_message_at
              ? dayKey(c.last_message_at, timeZone) === today
                ? formatClock(c.last_message_at, locale, timeZone)
                : formatShortDate(c.last_message_at, locale, timeZone)
              : "";
            return (
              <li key={c.id}>
                <Link
                  href={`/messages/${c.id}`}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex items-center gap-3 border-b border-line px-3 py-3 hover:bg-surface-muted", active && "bg-brand-50 hover:bg-brand-50")}
                >
                  {c.type === "direct" ? (
                    <Avatar name={c.title} src={other?.avatar_url} />
                  ) : (
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-secondary" aria-hidden>
                      <Users className="size-5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", unread ? "font-semibold text-ink" : "font-medium text-ink")}>{c.title}</span>
                      <span className="shrink-0 text-xs text-ink-muted tabular">{time}</span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", unread ? "text-ink" : "text-ink-muted")}>{preview}</span>
                      {c.is_muted ? <BellOff className="size-3.5 shrink-0 text-ink-muted" aria-label={t("muted")} /> : null}
                      {unread ? (
                        <span className="shrink-0 rounded-full bg-brand-solid px-1.5 text-xs font-semibold leading-5 text-ink-inverse tabular">
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
