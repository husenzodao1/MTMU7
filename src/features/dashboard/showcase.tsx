"use client";

import Link from "next/link";
import { CalendarDays, Megaphone, Newspaper } from "lucide-react";
import { useTranslations } from "next-intl";
import { DriftRow } from "@/features/dashboard/drift-row";

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

/** Enough cards in one copy to be wider than a wide screen, so the loop never shows a gap. */
const MIN_LOOP = 6;

function repeated<T>(items: T[], min: number): T[] {
  if (items.length === 0) return [];
  const out = [...items];
  while (out.length < min) out.push(...items);
  return out;
}

const ICON = { announcement: Megaphone, news: Newspaper, event: CalendarDays } as const;

function Card({ card, kind, echo }: { card: ShowcaseCard; kind: ShowcaseKind; echo: boolean }) {
  const t = useTranslations("portal.dashboard.showcase");
  const Icon = ICON[kind];
  return (
    <Link
      href={card.href}
      className="show-card"
      data-tone={card.tone ?? undefined}
      draggable={false}
      aria-hidden={echo || undefined}
      tabIndex={echo ? -1 : undefined}
    >
      {card.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- editorial images are arbitrary owner-supplied URLs
        <img src={card.image} alt="" className="show-img" loading="lazy" decoding="async" draggable={false} />
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
  );
}

function Row({ cards, kind, direction }: { cards: ShowcaseCard[]; kind: ShowcaseKind; direction: "left" | "right" }) {
  const loop = repeated(cards, MIN_LOOP);
  return (
    <DriftRow direction={direction} speed={22} className={`show-row show-row-${kind}`}>
      {loop.map((card, index) => (
        <Card key={`${card.id}-${index}`} card={card} kind={kind} echo={index >= cards.length} />
      ))}
    </DriftRow>
  );
}

/**
 * The dashboard's notice board, in motion: announcements with their pictures
 * drift to the left, the news under them to the right, the events under
 * those to the left again, each row set half a card along from the one above
 * like courses of brick. A finger holds a row or drags it; a tap opens the
 * card under it, moving or not. "All" opens everything, with filters.
 */
export function Showcase({ announcements, news, events }: { announcements: ShowcaseCard[]; news: ShowcaseCard[]; events: ShowcaseCard[] }) {
  const t = useTranslations("portal.dashboard.showcase");
  return (
    <section className="showcase" aria-labelledby="showcase-title">
      <h2 id="showcase-title" className="showcase-title">
        {t("title")}
      </h2>
      <div className="showcase-rows">
        {announcements.length ? <Row cards={announcements} kind="announcement" direction="left" /> : null}
        {news.length ? <Row cards={news} kind="news" direction="right" /> : null}
        {events.length ? <Row cards={events} kind="event" direction="left" /> : null}
      </div>
      <div className="showcase-foot">
        <Link href="/updates" className="showcase-all">
          {t("all")}
        </Link>
      </div>
    </section>
  );
}
