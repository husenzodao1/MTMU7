"use client";

import Link from "next/link";
import { ArrowUpRight, Megaphone, Newspaper, Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type CSSProperties, type MouseEvent } from "react";

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
/** Seconds each card takes to pass: slow enough to read a title. */
const SECONDS_PER_CARD = 7;

function repeated<T>(items: T[], min: number): T[] {
  if (items.length === 0) return [];
  const out = [...items];
  while (out.length < min) out.push(...items);
  return out;
}

function Card({ card, kind, echo }: { card: ShowcaseCard; kind: "announcement" | "news"; echo: boolean }) {
  const t = useTranslations("portal.dashboard.showcase");
  const Icon = kind === "announcement" ? Megaphone : Newspaper;
  return (
    <article className="show-card" data-tone={card.tone ?? undefined} aria-hidden={echo || undefined}>
      {card.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- editorial images are arbitrary owner-supplied URLs
        <img src={card.image} alt="" className="show-img" loading="lazy" decoding="async" />
      ) : (
        <div className="show-img show-img-empty">
          <Icon aria-hidden />
        </div>
      )}
      <div className="show-body">
        <p className="show-kicker">
          <span>{t(kind)}</span>
          {card.date ? <span>{card.date}</span> : null}
        </p>
        <h3 className="show-title">{card.title}</h3>
        {card.excerpt ? <p className="show-excerpt">{card.excerpt}</p> : null}
        <Link href={card.href} className="show-open" tabIndex={echo ? -1 : undefined}>
          {t("open")}
          <ArrowUpRight aria-hidden />
        </Link>
      </div>
    </article>
  );
}

function Row({ cards, kind }: { cards: ShowcaseCard[]; kind: "announcement" | "news" }) {
  const loop = repeated(cards, MIN_LOOP);
  return (
    <div className={`show-row show-row-${kind}`}>
      <div className="show-track" style={{ "--show-duration": `${loop.length * SECONDS_PER_CARD}s` } as CSSProperties}>
        {[0, 1].map((copy) => (
          <div key={copy} className="show-set">
            {loop.map((card, index) => (
              <Card key={`${card.id}-${index}`} card={card} kind={kind} echo={copy === 1 || index >= cards.length} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The dashboard's notice board, in motion: announcements with their pictures
 * drift to the left, and under them the news drifts to the right, the second
 * row set half a card along so the two lie like courses of brick. One tap
 * stops both, the next sets them going again; each card opens from its own
 * link, and the button in the corner does the same as a tap for a keyboard.
 * With reduced motion nothing drifts and the rows scroll by hand.
 */
export function Showcase({
  announcements,
  news,
  links,
}: {
  announcements: ShowcaseCard[];
  news: ShowcaseCard[];
  links: { announcements: boolean; news: boolean };
}) {
  const t = useTranslations("portal.dashboard");
  const [paused, setPaused] = useState(false);

  // A tap anywhere on the rows, except on a card's link, stops or restarts them.
  const toggle = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("a, button")) return;
    setPaused((value) => !value);
  };

  return (
    <section className="showcase" data-paused={paused || undefined} aria-labelledby="showcase-title">
      <header className="showcase-head">
        <div className="min-w-0">
          <h2 id="showcase-title" className="showcase-title">{t("showcase.title")}</h2>
          <p className="showcase-hint">{t("showcase.hint")}</p>
        </div>
        <button type="button" className="showcase-toggle" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
          {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
          <span>{paused ? t("showcase.play") : t("showcase.pause")}</span>
        </button>
      </header>
      <div className="showcase-rows" onClick={toggle}>
        {announcements.length ? <Row cards={announcements} kind="announcement" /> : null}
        {news.length ? <Row cards={news} kind="news" /> : null}
      </div>
      <footer className="showcase-links">
        {links.announcements ? <Link href="/announcements">{t("showcase.allAnnouncements")}</Link> : null}
        {links.news ? <Link href="/news">{t("showcase.allNews")}</Link> : null}
      </footer>
    </section>
  );
}
