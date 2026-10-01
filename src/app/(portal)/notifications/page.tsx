import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Bell, BellRing } from "lucide-react";
import { deleteReadNotificationsAction, markAllNotificationsReadAction } from "@/features/notifications/actions";
import { NOTIFICATION_TYPES, renderNotifications, type NotificationRow } from "@/features/notifications/render";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { FilterBar } from "@/components/ui/filters";
import { TabNav } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { Card, EmptyState, PageHeader } from "@/components/ui/surface";
import { requireAccess } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { buildQueryString, firstValue, parseListParams, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("notifications") };
}

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
    .order("created_at", { ascending: false })
    .range(list.offset, list.offset + list.pageSize - 1);
  if (unreadOnly) query = query.eq("is_read", false);
  if (list.filters.type) query = query.eq("type", list.filters.type);
  const [{ data, count }, { count: unreadCount }] = await Promise.all([
    query,
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", access.userId).eq("is_read", false),
  ]);
  const timeZone = access.school?.timezone ?? "Asia/Dushanbe";
  const items = await renderNotifications((data ?? []) as NotificationRow[], locale, timeZone);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            {(unreadCount ?? 0) > 0 ? (
              <ActionForm action={markAllNotificationsReadAction}>
                <SubmitButton variant="secondary">{t("markAllRead")}</SubmitButton>
              </ActionForm>
            ) : null}
            <ActionForm action={deleteReadNotificationsAction}>
              <SubmitButton variant="ghost">{t("clearRead")}</SubmitButton>
            </ActionForm>
          </>
        }
      />
      <TabNav
        label={t("views")}
        items={[
          { href: `/notifications${buildQueryString({}, { type: list.filters.type })}`, label: t("all"), active: !unreadOnly },
          { href: `/notifications${buildQueryString({}, { type: list.filters.type, view: "unread" })}`, label: t("unread"), active: unreadOnly, count: unreadCount ?? 0 },
        ]}
      />
      <FilterBar filters={[{ name: "type", label: t("type"), options: NOTIFICATION_TYPES.map((type) => ({ value: type, label: t(`types.${type}`) })) }]} />
      {items.length === 0 ? (
        <Card as="div">
          <EmptyState icon={<Bell />} title={unreadOnly ? t("emptyUnread") : t("empty")} />
        </Card>
      ) : (
        <Card as="div">
          <ul className="divide-y divide-line">
            {items.map((item) => {
              const content = (
                <>
                  <span className={cn("mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full", item.is_read ? "bg-surface-muted text-ink-muted" : "bg-brand-50 text-brand-text")} aria-hidden>
                    {item.is_read ? <Bell className="size-4" /> : <BellRing className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className={cn("text-sm", item.is_read ? "font-medium text-ink" : "font-semibold text-ink")}>
                        {!item.is_read ? <span className="sr-only">{t("unreadLabel")}: </span> : null}
                        {item.heading}
                      </span>
                      <time dateTime={item.created_at} className="text-xs text-ink-muted tabular">{formatDateTime(item.created_at, locale, timeZone)}</time>
                    </span>
                    {item.detail ? <span className="mt-0.5 line-clamp-2 block text-sm text-ink-secondary">{item.detail}</span> : null}
                  </span>
                </>
              );
              return (
                <li key={item.id}>
                  {item.link_url || !item.is_read ? (
                    <a href={`/notifications/open/${item.id}`} className="flex gap-3 px-4 py-3 hover:bg-surface-muted">
                      {content}
                    </a>
                  ) : (
                    <div className="flex gap-3 px-4 py-3">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <Pagination pathname="/notifications" searchParams={params} page={list.page} pageSize={list.pageSize} total={count ?? 0} />
    </>
  );
}
