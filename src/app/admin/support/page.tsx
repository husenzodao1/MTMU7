import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Headset, Inbox } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { ResolveRequestButton } from "@/features/support/request-actions";
import { Avatar, TabNav } from "@/components/ui/misc";
import { EmptyState, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/i18n/format";
import { pickText, type Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("support") };
}

interface InboxRow {
  id: string;
  requester_name: string;
  requester_avatar: string | null;
  requester_public_id: string | null;
  requester_roles: Array<{ slug: string; name_tg: string; name_ru: string | null; name_en: string | null }>;
  last_message_content: string;
  last_message_type: string;
  last_message_at: string;
  awaiting_reply: boolean;
  unread_count: number;
}

/**
 * The desk's inbox: people asking in the chat, and notes from people who
 * could not sign in. Chats waiting for an answer come first.
 */
export default async function SupportInboxPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("messages.moderate");
  const t = await getTranslations("admin.support");
  const tm = await getTranslations("portal.messages");
  const locale = (await getLocale()) as Locale;
  const view = firstValue((await searchParams).view);
  const tab: "chats" | "notes" | "done" = view === "notes" ? "notes" : view === "done" ? "done" : "chats";
  const supabase = await createClient();
  const timeZone = access.school!.timezone;

  const [{ data: inbox }, { data: notes }] = await Promise.all([
    tab === "chats" ? supabase.rpc("list_support_inbox", { p_limit: 200 }) : Promise.resolve({ data: [] }),
    tab !== "chats"
      ? supabase
          .from("support_requests")
          .select("id, name, contact, message, status, created_at, handled_at")
          .eq("school_id", access.school!.id)
          .eq("status", tab === "done" ? "done" : "open")
          .order("created_at", { ascending: tab !== "done" })
          .limit(200)
      : Promise.resolve({ data: [] }),
  ]);
  const chats = (inbox ?? []) as unknown as InboxRow[];

  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />} title={t("title")} description={t("description")} />
      <TabNav
        label={t("views")}
        items={[
          { href: "/admin/support", label: t("chats"), active: tab === "chats" },
          { href: "/admin/support?view=notes", label: t("notes"), active: tab === "notes" },
          { href: "/admin/support?view=done", label: t("done"), active: tab === "done" },
        ]}
      />

      {tab === "chats" ? (
        chats.length === 0 ? (
          <EmptyState icon={<Headset />} title={t("emptyChats")} />
        ) : (
          <ul className="overflow-hidden rounded-xl border border-line bg-surface">
            {chats.map((c) => (
              <li key={c.id} className="border-b border-line last:border-b-0">
                <Link href={`/admin/support/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted">
                  <Avatar name={c.requester_name} src={c.requester_avatar} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", c.unread_count > 0 ? "font-semibold text-ink" : "font-medium text-ink")}>
                        {c.requester_name || tm("unknownUser")}
                        <span className="ms-2 text-xs font-normal text-ink-muted">
                          {[c.requester_public_id, ...c.requester_roles.map((r) => pickText({ tg: r.name_tg, ru: r.name_ru, en: r.name_en }, locale))]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-ink-muted tabular">{formatDateTime(c.last_message_at, locale, timeZone)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", c.unread_count > 0 ? "text-ink" : "text-ink-muted")}>
                        {c.last_message_type === "location"
                          ? `📍 ${tm("locationShort")}`
                          : c.last_message_type === "image"
                            ? `📷 ${c.last_message_content || tm("photo")}`
                            : c.last_message_type === "file"
                              ? `📎 ${c.last_message_content || tm("fileShort")}`
                              : c.last_message_type === "audio"
                                ? `🎤 ${tm("voice")}`
                                : c.last_message_content}
                      </span>
                      {c.unread_count > 0 ? (
                        <span className="shrink-0 rounded-full bg-brand-solid px-1.5 text-xs font-semibold leading-5 text-brand-on-solid tabular">{c.unread_count}</span>
                      ) : c.awaiting_reply ? (
                        <span className="shrink-0 rounded bg-warning-50 px-1.5 py-px text-[0.6875rem] font-medium text-warning-700">{t("awaiting")}</span>
                      ) : null}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : (notes ?? []).length === 0 ? (
        <EmptyState icon={<Inbox />} title={tab === "done" ? t("emptyDone") : t("emptyNotes")} />
      ) : (
        <ul className="space-y-3">
          {(notes ?? []).map((n) => (
            <li key={n.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{n.name}</p>
                  <p className="text-sm text-ink-secondary">
                    <a
                      href={n.contact.includes("@") ? `mailto:${n.contact}` : `tel:${n.contact.replace(/[^\d+]/g, "")}`}
                      className="font-medium text-brand-text hover:underline"
                    >
                      {n.contact}
                    </a>
                    <span className="text-ink-muted"> · {formatDateTime(n.created_at, locale, timeZone)}</span>
                  </p>
                </div>
                <ResolveRequestButton id={n.id} done={n.status === "done"} />
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm text-ink">{n.message}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
