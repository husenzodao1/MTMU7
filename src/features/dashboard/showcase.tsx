import Link from "next/link";
import { ArrowRight, CalendarDays, Megaphone, Newspaper } from "lucide-react";
import { getTranslations } from "next-intl/server";

export type ShowcaseKind = "announcement" | "news" | "event";

export interface ShowcaseCard {
  id: string;
  title: string;
  excerpt: string;
  image: string | null;
  href: string;
  /** Already formatted for the reader. */
  date: string;
  /** An urgent or important announcement wears its colour. */
  tone: "critical" | "important" | null;
}

/** As many as can be taken in at one look; the rest are a tap away on "All". */
const LIMIT = 9;

const ICON = { announcement: Megaphone, news: Newspaper, event: CalendarDays } as const;

/**
 * The dashboard's notice board: one quiet row of cards that stands still and
 * scrolls sideways under a finger, a trackpad or the arrow keys. What the
 * school needs read comes first — urgent and important announcements, then
 * the rest of them — then what is coming up, then the news. "All" opens
 * everything, with filters.
 */
export async function Showcase({ announcements, news, events }: { announcements: ShowcaseCard[]; news: ShowcaseCard[]; events: ShowcaseCard[] }) {
  const t = await getTranslations("portal.dashboard.showcase");
  const rank = (card: ShowcaseCard) => (card.tone === "critical" ? 0 : card.tone === "important" ? 1 : 2);
  const cards = [
    ...[...announcements].sort((a, b) => rank(a) - rank(b)).map((card) => ({ card, kind: "announcement" as const })),
    ...events.map((card) => ({ card, kind: "event" as const })),
    ...news.map((card) => ({ card, kind: "news" as const })),
  ].slice(0, LIMIT);

  return (
    <section className="showcase" aria-labelledby="showcase-title">
      <div className="showcase-head">
        <h2 id="showcase-title" className="showcase-title">
          {t("title")}
        </h2>
        <Link href="/updates" className="showcase-all">
          {t("all")}
          <ArrowRight aria-hidden />
        </Link>
      </div>
      <ul className="showcase-rail">
        {cards.map(({ card, kind }) => {
          const Icon = ICON[kind];
          return (
            <li key={`${kind}-${card.id}`}>
              <Link href={card.href} className="show-card" data-tone={card.tone ?? undefined}>
                {card.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- editorial images are arbitrary owner-supplied URLs
                  <img src={card.image} alt="" className="show-img" loading="lazy" decoding="async" />
                ) : (
                  <span className="show-img show-img-empty">
                    <Icon aria-hidden />
                  </span>
                )}
                <span className="show-body">
                  <span className="show-kicker">
                    <span>{t(kind)}</span>
                    {card.date ? <span>{card.date}</span> : null}
                  </span>
                  <span className="show-title">{card.title}</span>
                  {card.excerpt ? <span className="show-excerpt">{card.excerpt}</span> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
