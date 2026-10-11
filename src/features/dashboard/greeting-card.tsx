"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { dayPart, type DayPart } from "@/lib/i18n/format";

/**
 * The school itself, photographed. It stands behind the greeting graded down
 * to the night canvas, so it reads as a place and never as decoration, and the
 * text over it keeps the same contrast in every theme.
 *
 * Moving footage of the school would suit this spot better; there is none
 * licensed for the portal yet (docs/design/art-direction.md, "Missing
 * assets"), and a picture pretending to move is worse than an honest still.
 */
const SCHOOL_PHOTO = "/images/school-bg.webp";

/**
 * "Шом ба хайр, Фарангис" — the one line on the portal addressed to the
 * person reading it, and the one thing they most likely came to do.
 *
 * The greeting is set in the serif in warm white, the name in brass. The
 * server chooses the first greeting from the school's clock; a page left open
 * across six o'clock should not go on wishing a good afternoon, so the card
 * looks at the clock again every minute.
 */
export function GreetingCard({
  name,
  timeZone,
  initialPart,
  dateLine,
  actions,
}: {
  name: string;
  timeZone?: string;
  initialPart: DayPart;
  dateLine?: string;
  actions?: ReactNode;
}) {
  const t = useTranslations("portal.dashboard");
  const [part, setPart] = useState<DayPart>(initialPart);

  useEffect(() => {
    const tick = () => setPart(dayPart(timeZone));
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [timeZone]);

  return (
    <section className="greeting-card mb-6" aria-labelledby="greeting-title">
      <Image
        src={SCHOOL_PHOTO}
        alt=""
        fill
        sizes="(min-width: 1024px) 75vw, 100vw"
        loading="eager"
        fetchPriority="high"
        className="greeting-photo"
      />
      <div className="greeting-body">
        {dateLine ? <p className="greeting-date">{dateLine}</p> : null}
        <h1 id="greeting-title" className="greeting-title">
          {t(`greetings.${part}`)}
          {name ? (
            <>
              , <span className="greeting-name">{name}</span>
            </>
          ) : null}
        </h1>
        <p className="greeting-wish">{t(`wishes.${part}`)}</p>
        {actions ? <div className="mt-5 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}
