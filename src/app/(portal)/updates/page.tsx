import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarDays, Megaphone, Newspaper, Search } from "lucide-react";
import { splitLeadImage } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/surface";
import { getLatestNews, getUpcomingEvents, getVisibleAnnouncements, mapEvent, publicMediaUrl } from "@/features/content/queries";
import { can, hasModule } from "@/lib/auth/access";
import { requireAccess } from "@/lib/auth/guards";
import { markdownToPlainText } from "@/lib/content/markdown";
import { formatDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { getRequestTime, requestTimeMinus } from "@/lib/request-time";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portal.updates");
  return { title: t("title") };
}

type Kind = "announcement" | "news" | "event";
const KINDS: Kind[] = ["announcement", "news", "event"];
const PERIODS = ["all", "week", "month"] as const;
type Period = (typeof PERIODS)[number];
const DAYS: Record<Period, number | null> = { all: null, week: 7, month: 31 };
const ICON = { announcement: Megaphone, news: Newspaper, event: CalendarDays } as const;

interface Item {
  key: string;
  anchor: string;
  kind: Kind;
  title: string;
  excerpt: string;
  image: string | null;
  href: string | null;
  at: string;
  tone: "critical" | "important" | null;
}

/**
 * Everything the dashboard's board shows, in one place: announcements, news
 * and events together, newest first, laid out like the board's cards in
 * columns, with three small filters — what, how recent, and words to look
 * for. Each kind appears only where its module is on and this person may see
 * it.
 */
export default async function UpdatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireAccess();
  const t = await getTranslations("portal.updates");
  const kinds = await getTranslations("portal.dashboard.showcase");
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const schoolId = access.school!.id;

  const wanted = firstValue(params.type);
  const type: Kind | "all" = KINDS.includes(wanted as Kind) ? (wanted as Kind) : "all";
  const periodValue = firstValue(params.period);
  const period: Period = PERIODS.includes(periodValue as Period) ? (periodValue as Period) : "all";
  const query = (firstValue(params.q) ?? "").trim().slice(0, 80);

  const allowed = {
    announcement: hasModule(access, "announcements") && can(access, "announcements.view"),
    news: hasModule(access, "news") && can(access, "news.view"),
    event: hasModule(access, "events") && can(access, "events.view"),
  };
  const want = (kind: Kind) => allowed[kind] && (type === "all" || type === kind);

  const supabase = await createClient();
  const [announcements, news, upcoming, past] = await Promise.all([
    want("announcement") ? getVisibleAnnouncements(schoolId, 60) : Promise.resolve([]),
    want("news") ? getLatestNews(schoolId, 60) : Promise.resolve([]),
    want("event") ? getUpcomingEvents(schoolId, 40) : Promise.resolve([]),
    want("event")
      ? supabase
          .from("events")
          .select("id, title, description, category, starts_at, ends_at, all_day, location, audience, organizer, image_path, status")
          .eq("school_id", schoolId)
          .eq("status", "published")
          .lt("starts_at", requestTimeMinus(0))
          .gte("starts_at", requestTimeMinus(90 * 86400 * 1000))
          .order("starts_at", { ascending: false })
          .limit(30)
          .then(({ data }) => (data ?? []).map(mapEvent))
      : Promise.resolve([]),
  ]);

  let items: Item[] = [
    ...announcements.map((a) => ({
      key: `a-${a.id}`,
      anchor: `a-${a.id}`,
      kind: "announcement" as const,
      title: a.title,
      excerpt: markdownToPlainText(a.body, 220),
      image: splitLeadImage(a.body).lead?.src ?? null,
      href: `/announcements#a-${a.id}`,
      at: a.publishAt,
      tone: a.priority === "normal" ? null : a.priority,
    })),
    ...news.map((n) => ({
      key: `n-${n.id}`,
      anchor: `n-${n.id}`,
      kind: "news" as const,
      title: n.title,
      excerpt: n.summary?.trim() || markdownToPlainText(n.content, 220),
      image: n.coverImageUrl ?? splitLeadImage(n.content).lead?.src ?? null,
      href: `/news/${n.slug}`,
      at: n.publishAt ?? "",
      tone: null,
    })),
    ...[...upcoming, ...past].map((e) => ({
      key: `e-${e.id}`,
      anchor: `e-${e.id}`,
      kind: "event" as const,
      title: e.title,
      excerpt: [e.location, e.description ? markdownToPlainText(e.description, 220) : null].filter(Boolean).join(" · "),
      image: publicMediaUrl(e.imagePath),
      href: null,
      at: e.startsAt,
      tone: null,
    })),
  ];

  const days = DAYS[period];
  if (days !== null) {
    const now = getRequestTime();
    const since = now - days * 86400 * 1000;
    // Upcoming events count as recent: they are what is about to happen.
    items = items.filter((item) => (item.kind === "event" && Date.parse(item.at) > now) || Date.parse(item.at) >= since);
  }
  if (query) {
    const needle = query.toLocaleLowerCase();
    items = items.filter((item) => `${item.title} ${item.excerpt}`.toLocaleLowerCase().includes(needle));
  }
  items.sort((x, y) => (y.at || "").localeCompare(x.at || ""));

  const link = (next: Partial<{ type: string; period: string; q: string }>) => {
    const merged = { type, period, q: query, ...next };
    const search = new URLSearchParams();
    if (merged.type !== "all") search.set("type", merged.type);
    if (merged.period !== "all") search.set("period", merged.period);
    if (merged.q) search.set("q", merged.q);
    const text = search.toString();
    return text ? `/updates?${text}` : "/updates";
  };

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-center font-display text-base font-semibold text-ink">{t("title")}</h1>

      <div className="updates-filters">
        <nav aria-label={t("kind")} className="updates-chips">
          {(["all", ...KINDS.filter((kind) => allowed[kind])] as const).map((kind) => (
            <Link key={kind} href={link({ type: kind })} aria-current={type === kind ? "true" : undefined} className={cn("updates-chip", type === kind && "updates-chip-on")}>
              {kind === "all" ? t("all") : kinds(kind)}
            </Link>
          ))}
        </nav>
        <nav aria-label={t("period")} className="updates-chips">
          {PERIODS.map((value) => (
            <Link key={value} href={link({ period: value })} aria-current={period === value ? "true" : undefined} className={cn("updates-chip", period === value && "updates-chip-on")}>
              {t(`periods.${value}`)}
            </Link>
          ))}
        </nav>
        <form action="/updates" className="updates-search" role="search">
          {type !== "all" ? <input type="hidden" name="type" value={type} /> : null}
          {period !== "all" ? <input type="hidden" name="period" value={period} /> : null}
          <Search aria-hidden />
          <label htmlFor="updates-q" className="sr-only">
            {t("search")}
          </label>
          <input id="updates-q" name="q" type="search" defaultValue={query} placeholder={t("search")} maxLength={80} />
        </form>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<Megaphone />} title={t("empty")} />
      ) : (
        <ul className="updates-grid">
          {items.map((item) => {
            const Icon = ICON[item.kind];
            const body = (
              <>
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- editorial images are arbitrary owner-supplied URLs
                  <img src={item.image} alt="" className="updates-img" loading="lazy" decoding="async" />
                ) : null}
                <span className="updates-body">
                  <span className="updates-kicker">
                    <Icon aria-hidden />
                    {kinds(item.kind)}
                    {item.at ? <span className="text-ink-muted"> · {formatDate(item.at, locale)}</span> : null}
                  </span>
                  <span className="updates-title">{item.title}</span>
                  {item.excerpt ? <span className="updates-excerpt">{item.excerpt}</span> : null}
                </span>
              </>
            );
            return (
              <li key={item.key} id={item.anchor} className="updates-item scroll-mt-24" data-tone={item.tone ?? undefined}>
                {item.href ? (
                  <Link href={item.href} className="updates-card">
                    {body}
                  </Link>
                ) : (
                  <div className="updates-card">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
