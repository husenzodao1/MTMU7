import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import {
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CheckCheck,
  FileText,
  Megaphone,
  Newspaper,
  NotebookPen,
  Radio,
  ShieldCheck,
  Star,
  Trash2,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { deleteReadNotificationsAction, markAllNotificationsReadAction } from "@/features/notifications/actions";
import { NOTIFICATION_TYPES, renderNotifications, type NotificationRow } from "@/features/notifications/render";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filters";
import { ListBox, Pagination } from "@/components/ui/pagination";
import { Card, EmptyState, PageHeader } from "@/components/ui/surface";
import { requireAccess } from "@/lib/auth/guards";
import { dayKey, formatClock, formatDate, todayIso } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { buildQueryString, firstValue, parseListParams, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("notifications") };
}

/** A sign per kind of news, in its own colour (globals.css, .notice-icon[data-type]). */
const TYPE_ICON: Record<string, LucideIcon> = {
  grade: Star,
  homework: NotebookPen,
  schedule: CalendarDays,
  attendance: CalendarCheck,
  announcement: Megaphone,
  document: FileText,
  library: BookOpen,
  system: ShieldCheck,
  friend: UserPlus,
  event: Users,
  news: Newspaper,
  registration: UserPlus,
  moderation: ShieldCheck,
  broadcast: Radio,
};

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireAccess();
  const t = await getTranslations("portal.notifications");
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const unreadOnly = firstValue(params.view) === "unread";
  const list = parseListParams(params, { sorts: ["recent"], defaultSort: "recent", pageSize: 30, filters: { type: NOTIFICATION_TYPES } });

  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .select("id, type, template_key, params, title, body, link_url, is_read, created_at", { count: "exact" })
    .eq("user_id", access.userId)
    // The portal's chat is retired: its notes are not news any more.
    .neq("type", "message")
    .order("created_at", { ascending: false })
    .range(list.offset, list.offset + list.pageSize - 1);
  if (unreadOnly) query = query.eq("is_read", false);
  if (list.filters.type) query = query.eq("type", list.filters.type);
  const [{ data, count }, { count: unreadCount }] = await Promise.all([
    query,
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", access.userId).eq("is_read", false).neq("type", "message"),
  ]);
  const timeZone = access.school?.timezone ?? "Asia/Dushanbe";
  const items = await renderNotifications((data ?? []) as NotificationRow[], locale, timeZone);

  // Grouped by day — today, yesterday, then the date — each with only the
  // time on it; the newest first, as they came.
  const today = todayIso(timeZone);
  const noon = new Date(`${today}T12:00:00Z`);
  noon.setUTCDate(noon.getUTCDate() - 1);
  const yesterday = noon.toISOString().slice(0, 10);
  const days: Array<{ key: string; label: string; items: typeof items }> = [];
  for (const item of items) {
    const key = dayKey(item.created_at, timeZone);
    let day = days.at(-1);
    if (day?.key !== key) {
      day = { key, label: key === today ? t("today") : key === yesterday ? t("yesterday") : formatDate(item.created_at, locale, timeZone), items: [] };
      days.push(day);
    }
    day.items.push(item);
  }
  let order = 0;

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="notice-bar">
        <nav className="notice-views" aria-label={t("views")}>
          <a href={`/notifications${buildQueryString({}, { type: list.filters.type })}`} aria-current={!unreadOnly ? "page" : undefined}>
            {t("all")}
          </a>
          <a href={`/notifications${buildQueryString({}, { type: list.filters.type, view: "unread" })}`} aria-current={unreadOnly ? "page" : undefined}>
            {t("unread")}
            {(unreadCount ?? 0) > 0 ? <span className="notice-count tabular">{unreadCount}</span> : null}
          </a>
        </nav>
        <div className="flex items-center gap-1">
          {(unreadCount ?? 0) > 0 ? (
            <ActionForm action={markAllNotificationsReadAction}>
              <SubmitButton variant="ghost" size="sm" className="notice-tool">
                <CheckCheck aria-hidden />
                <span className="sr-only sm:not-sr-only">{t("markAllRead")}</span>
              </SubmitButton>
            </ActionForm>
          ) : null}
          <ConfirmAction
            action={deleteReadNotificationsAction}
            fields={{}}
            title={t("clearReadTitle")}
            description={t("clearReadDescription")}
            confirmLabel={t("clearRead")}
            trigger={
              <Button variant="ghost" size="sm" className="notice-tool" aria-label={t("clearRead")}>
                <Trash2 aria-hidden />
                <span className="sr-only sm:not-sr-only">{t("clearRead")}</span>
              </Button>
            }
          />
        </div>
      </div>
      <FilterBar filters={[{ name: "type", label: t("type"), options: NOTIFICATION_TYPES.filter((type) => type !== "message" && type !== "moderation").map((type) => ({ value: type, label: t(`types.${type}`) })) }]} />
      <ListBox>
        {items.length === 0 ? (
          <Card as="div">
            <EmptyState icon={<Bell />} title={unreadOnly ? t("emptyUnread") : t("empty")} />
          </Card>
        ) : (
          <div className="notice-days">
            {days.map((day) => (
              <section key={day.key} aria-label={day.label}>
                <h2 className="notice-day">{day.label}</h2>
                <ul className="notice-list">
                  {day.items.map((item) => {
                    const Icon = TYPE_ICON[item.type] ?? Bell;
                    const content = (
                      <>
                        <span className="notice-icon" data-type={item.type} aria-hidden>
                          <Icon />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="notice-head">
                            <span className="notice-title">
                              {!item.is_read ? <span className="sr-only">{t("unreadLabel")}: </span> : null}
                              {item.heading}
                            </span>
                            <time dateTime={item.created_at} className="notice-time tabular">
                              {formatClock(item.created_at, locale, timeZone)}
                            </time>
                          </span>
                          {item.detail ? <span className="notice-detail">{item.detail}</span> : null}
                        </span>
                      </>
                    );
                    return (
                      <li key={item.id} className="notice" data-unread={item.is_read ? undefined : ""} style={{ "--i": Math.min(order++, 12) } as React.CSSProperties}>
                        {item.link_url || !item.is_read ? (
                          <a href={`/notifications/open/${item.id}`} className="notice-card">
                            {content}
                          </a>
                        ) : (
                          <div className="notice-card">{content}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
        <Pagination pathname="/notifications" searchParams={params} page={list.page} pageSize={list.perPage} total={count ?? 0} />
      </ListBox>
    </>
  );
}
