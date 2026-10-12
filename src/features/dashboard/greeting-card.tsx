"use client";

import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Suspense, use, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { WeatherPhoto } from "@/features/dashboard/weather-photo";
import type { Weather, WeatherKind } from "@/features/dashboard/weather-kind";
import { dayPart, type DayPart } from "@/lib/i18n/format";

/**
 * "Шом ба хайр, Фарангис!" — the one line on the portal addressed to the
 * person reading it, in a light hand, over a photograph of the sky as it is
 * in Istaravshan at this hour (weather-photo.tsx).
 *
 * The line never breaks: the greeting, the name and the "!" stay on one row,
 * the letters getting smaller for a long name (down to a floor), and only past
 * that floor does the name end in "…" — the "!" is never left alone on a line
 * of its own.
 *
 * The server chooses the first greeting from the school's clock. A page left
 * open across six o'clock should not go on wishing a good afternoon, so the
 * card looks at the clock again every minute. The weather comes as a promise
 * the page does not wait for: the card is drawn at once, and the photograph
 * comes in when the answer does.
 */

const WEATHER_ICON: Record<WeatherKind, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

/** The largest and smallest size of the greeting line, in px: a light hand, never shouting. */
const FIT = { phone: [28, 18], wide: [38, 22] } as const;

/** Shrinks the line until it fits its row, within FIT. */
function useOneLine(text: string) {
  const ref = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const [max, min] = window.innerWidth >= 640 ? FIT.wide : FIT.phone;
      // Measured at full length: the name may not shorten itself meanwhile.
      el.setAttribute("data-measuring", "");
      let size = max;
      el.style.fontSize = `${size}px`;
      // The words' own widths, unrounded: a line that seems to fit exactly
      // may be a fraction over, enough for the name to end in "…". Two
      // pixels to spare.
      const used = () => Array.from(el.children).reduce((sum, word) => sum + word.getBoundingClientRect().width, 0);
      while (used() > el.clientWidth - 2 && size > min) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
      el.removeAttribute("data-measuring");
    };
    fit();
    // Again when the card is resized, and when the script face arrives and
    // the words change width under the same box.
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    for (const word of Array.from(el.children)) observer.observe(word);
    document.fonts?.addEventListener("loadingdone", fit);
    return () => {
      observer.disconnect();
      document.fonts?.removeEventListener("loadingdone", fit);
    };
  }, [text]);
  return ref;
}

/** The photograph stops drifting while nobody can see it. */
function useOnScreen() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) el.setAttribute("data-on-screen", "");
      else el.removeAttribute("data-on-screen");
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function WeatherSky({ part, weather }: { part: DayPart; weather: Promise<Weather | null> }) {
  const t = useTranslations("portal.dashboard.weather");
  const now = use(weather);
  if (!now) return <WeatherPhoto part={part} kind={null} />;
  const Icon = part === "night" || part === "evening" ? (now.kind === "clear" ? Moon : now.kind === "partly" ? CloudMoon : WEATHER_ICON[now.kind]) : WEATHER_ICON[now.kind];
  return (
    <>
      <WeatherPhoto part={part} kind={now.kind} />
      <p className="sky-chip" title={t(`kinds.${now.kind}`)}>
        <Icon className="size-3.5" aria-hidden />
        <span className="tabular">{now.temperature > 0 ? "+" : ""}{now.temperature}°</span>
        <span className="sky-chip-town">{t("town")}</span>
        <span className="sr-only">{t(`kinds.${now.kind}`)}</span>
      </p>
    </>
  );
}

export function GreetingCard({
  name,
  timeZone,
  initialPart,
  dateLine,
  actions,
  weather,
  preview,
}: {
  name: string;
  timeZone?: string;
  initialPart: DayPart;
  dateLine?: string;
  actions?: ReactNode;
  /** The weather in Istaravshan, not waited for (weather.ts). */
  weather?: Promise<Weather | null>;
  /** A fixed hour, for the preview page: the clock is not looked at. */
  preview?: boolean;
}) {
  const t = useTranslations("portal.dashboard");
  const [part, setPart] = useState<DayPart>(initialPart);

  useEffect(() => {
    if (preview) return;
    const tick = () => setPart(dayPart(timeZone));
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [timeZone, preview]);

  const greeting = t(`greetings.${part}`);
  const line = useOneLine(`${greeting} ${name}`);
  const card = useOnScreen();

  return (
    <section
      ref={card}
      className="greeting-card mb-6 rounded-3xl px-5 pb-14 pt-6 shadow-sm sm:px-8 sm:pb-10 sm:pt-8"
      data-part={part}
      data-on-screen=""
      aria-labelledby="greeting-title"
    >
      {/* Until the weather is known, the hour's colours alone: one photograph, not two. */}
      {weather ? (
        <Suspense fallback={<div className="photo-sky" aria-hidden />}>
          <WeatherSky part={part} weather={weather} />
        </Suspense>
      ) : (
        <WeatherPhoto part={part} kind={null} />
      )}
      <div className="relative min-w-0">
        {dateLine ? <p className="greeting-date text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-white/75">{dateLine}</p> : null}
        <h1 ref={line} id="greeting-title" className="greeting-line mt-2">
          <span className="greeting-word">{greeting},</span>
          {name ? (
            <>
              <span className="greeting-gap" aria-hidden>
                {" "}
              </span>
              <span className="greeting-name">{name}</span>
            </>
          ) : null}
          <span className="greeting-word">!</span>
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/85 [text-shadow:0_1px_8px_rgb(0_0_0/0.35)]">{t(`wishes.${part}`)}</p>
        {actions ? <div className="mt-5 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}
