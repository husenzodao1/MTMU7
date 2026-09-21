import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarRange, Megaphone, Newspaper, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/surface";
import { markdownToPlainText } from "@/lib/content/markdown";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import type { AnnouncementItem, EventItem, NewsListItem } from "@/features/content/queries";
import { cn } from "@/lib/utils/cn";

export async function AnnouncementList({ items, compact }: { items: AnnouncementItem[]; compact?: boolean }) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("portal.announcements");
  if (items.length === 0) return <EmptyState icon={<Megaphone />} title={t("empty")} className="py-6" />;
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.id} className={cn("py-3", item.priority === "critical" && "border-s-4 border-danger-600 ps-3")}>
          <div className="flex flex-wrap items-center gap-2">
            {item.priority !== "normal" ? (
              <Badge tone={item.priority === "critical" ? "danger" : "warning"}>{t(`priority.${item.priority}`)}</Badge>
            ) : null}
            <Link href={`/announcements#a-${item.id}`} className="font-medium text-ink hover:text-brand-text hover:underline">
              {item.title}
            </Link>
          </div>
          <p className="mt-0.5 text-sm text-ink-secondary">{markdownToPlainText(item.body, compact ? 140 : 280)}</p>
          <p className="mt-1 text-xs text-ink-muted tabular">{formatDateTime(item.publishAt, locale)}</p>
        </li>
      ))}
    </ul>
  );
}

export async function EventList({ items }: { items: EventItem[] }) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("portal.events");
  if (items.length === 0) return <EmptyState icon={<CalendarRange />} title={t("empty")} className="py-6" />;
  return (
    <ul className="divide-y divide-line">
      {items.map((event) => {
        const start = new Date(event.startsAt);
        return (
          <li key={event.id} className="flex gap-3 py-3">
            <div className="flex w-12 shrink-0 flex-col items-center rounded-md border border-line bg-surface-muted py-1 text-center">
              <span className="text-lg font-semibold leading-tight tabular">{start.getDate()}</span>
              <span className="text-xs text-ink-muted">{formatDate(event.startsAt, locale).replace(/^\d+\s*/, "").split(" ")[0]}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className={cn("font-medium text-ink", event.status === "cancelled" && "line-through")}>{event.title}</p>
                {event.status === "cancelled" ? <Badge tone="danger">{t("cancelled")}</Badge> : <Badge>{t(`categories.${event.category}`)}</Badge>}
              </div>
              <p className="text-sm text-ink-muted tabular">{event.allDay ? formatDate(event.startsAt, locale) : formatDateTime(event.startsAt, locale)}</p>
              {event.location ? (
                <p className="flex items-center gap-1 text-sm text-ink-muted">
                  <MapPin className="size-3.5" aria-hidden />
                  {event.location}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export async function NewsCompactList({ items, hrefBase = "/news" }: { items: NewsListItem[]; hrefBase?: string }) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("portal.news");
  if (items.length === 0) return <EmptyState icon={<Newspaper />} title={t("empty")} className="py-6" />;
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.id} className="py-3">
          <Link href={`${hrefBase}/${item.slug}`} className="font-medium text-ink hover:text-brand-text hover:underline">
            {item.title}
          </Link>
          <p className="mt-0.5 line-clamp-2 text-sm text-ink-secondary">{item.summary || markdownToPlainText(item.content, 160)}</p>
          {item.publishAt ? <p className="mt-1 text-xs text-ink-muted tabular">{formatDate(item.publishAt, locale)}</p> : null}
        </li>
      ))}
    </ul>
  );
}
