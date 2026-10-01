"use client";

import { Moon, Sun, Sunrise, Sunset } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { dayPart, type DayPart } from "@/lib/i18n/format";

const ICONS: Record<DayPart, typeof Sun> = { morning: Sunrise, day: Sun, evening: Sunset, night: Moon };

/**
 * "Шом ба хайр, Фарангис!" — the one line on the portal addressed to the
 * person reading it.
 *
 * The greeting is in white and the name in the school's gold, set in a brush
 * script, on a small sky that changes with the hour: dawn, a blue afternoon,
 * a sunset, stars. The sky is dark in every theme, so the white and the gold
 * never depend on the theme for their contrast.
 *
 * The server chooses the first greeting from the school's clock. A page left
 * open across six o'clock should not go on wishing a good afternoon, so the
 * card looks at the clock again every minute.
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

  const Icon = ICONS[part];

  return (
    <section className="greeting-card mb-6 rounded-3xl px-5 py-6 shadow-sm sm:px-8 sm:py-8" data-part={part} aria-labelledby="greeting-title">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {dateLine ? <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-white/70">{dateLine}</p> : null}
          <h1 id="greeting-title" className="mt-2 text-[1.9rem] leading-[1.3] sm:text-[2.75rem] sm:leading-[1.25]">
            <span className="greeting-word">{t(`greetings.${part}`)},</span>{" "}
            {name ? <span className="greeting-name inline-block text-[1.1em]">{name}</span> : null}
            <span className="greeting-word">!</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/80">{t(`wishes.${part}`)}</p>
        </div>
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#f5c542] ring-1 ring-white/15 backdrop-blur-sm sm:size-14" aria-hidden>
          <Icon className="size-6 sm:size-7" />
        </span>
      </div>
      {actions ? <div className="mt-5 flex flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
}
