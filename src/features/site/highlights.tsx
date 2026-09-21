import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarDays, MapPin } from "lucide-react";
import { markdownToPlainText } from "@/lib/content/markdown";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import type { PublicArticle, PublicEvent } from "@/features/site/public-content";

/** Latest news of a school: one lead article, the rest as a compact list. */
export async function NewsHighlights({ articles, schoolSlug }: { articles: PublicArticle[]; schoolSlug: string }) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("site.public")]);
  if (articles.length === 0) return null;
  const [lead, ...rest] = articles;

  return (
    <section aria-labelledby="site-news" className="border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="site-news" className="text-2xl font-semibold tracking-tight text-ink">{t("news")}</h2>
          <Link className="text-sm font-semibold text-brand-text hover:underline" href={`/s/${schoolSlug}/news`}>
            {t("allNews")}
          </Link>
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          {lead ? (
            <article>
              {lead.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- editorial image URL may live outside the Next loader
                <img src={lead.coverImageUrl} alt="" className="mb-5 aspect-[16/9] w-full object-cover" />
              ) : null}
              {lead.publishAt ? (
                <time dateTime={lead.publishAt} className="text-sm text-ink-muted">{formatDate(lead.publishAt, locale as Locale)}</time>
              ) : null}
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                <Link className="hover:text-brand-text hover:underline" href={`/s/${schoolSlug}/news/${lead.slug}`}>{lead.title}</Link>
              </h3>
              <p className="mt-3 max-w-2xl leading-7 text-ink-secondary">
                {lead.summary || markdownToPlainText(lead.content, 260)}
              </p>
            </article>
          ) : null}

          {rest.length ? (
            <ul className="divide-y divide-line border-t border-line lg:border-t-0">
              {rest.map((article) => (
                <li key={article.id} className="py-4 first:lg:pt-0">
                  {article.publishAt ? (
                    <time dateTime={article.publishAt} className="text-xs text-ink-muted">{formatDate(article.publishAt, locale as Locale)}</time>
                  ) : null}
                  <h3 className="mt-1 font-semibold text-ink">
                    <Link className="hover:text-brand-text hover:underline" href={`/s/${schoolSlug}/news/${article.slug}`}>{article.title}</Link>
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-secondary">
                    {article.summary || markdownToPlainText(article.content, 140)}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Upcoming events of a school as a dated list. */
export async function EventHighlights({ events, schoolSlug }: { events: PublicEvent[]; schoolSlug: string }) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("site.public")]);
  if (events.length === 0) return null;

  return (
    <section aria-labelledby="site-events" className="border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="site-events" className="text-2xl font-semibold tracking-tight text-ink">{t("events")}</h2>
          <Link className="text-sm font-semibold text-brand-text hover:underline" href={`/s/${schoolSlug}/events`}>
            {t("allEvents")}
          </Link>
        </div>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <li key={event.id} className="border border-line bg-surface p-5">
              <p className="flex items-center gap-2 text-sm font-medium text-brand-text">
                <CalendarDays className="size-4 shrink-0" aria-hidden />
                <time dateTime={event.startsAt}>{formatDateTime(event.startsAt, locale as Locale)}</time>
              </p>
              <h3 className="mt-2 font-semibold text-ink">{event.title}</h3>
              {event.location ? (
                <p className="mt-1 flex items-center gap-2 text-sm text-ink-secondary">
                  <MapPin className="size-4 shrink-0" aria-hidden />
                  {event.location}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
