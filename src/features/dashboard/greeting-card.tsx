"use client";

import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun, type LucideIcon } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Suspense, use, useEffect, useState, type ReactNode } from "react";
import type { Weather, WeatherKind } from "@/features/dashboard/weather-kind";
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

/** The weather in Istaravshan as one quiet line: an icon, the temperature, the town. */
function WeatherLine({ part, weather }: { part: DayPart; weather: Promise<Weather | null> }) {
  const t = useTranslations("portal.dashboard.weather");
  const now = use(weather);
  if (!now) return null;
  const dark = part === "night" || part === "evening";
  const Icon = dark && now.kind === "clear" ? Moon : dark && now.kind === "partly" ? CloudMoon : WEATHER_ICON[now.kind];
  return (
    <p className="greeting-weather" title={t(`kinds.${now.kind}`)}>
      <Icon aria-hidden />
      <span className="tabular">
        {now.temperature > 0 ? "+" : ""}
        {now.temperature}°
      </span>
      <span>{t("town")}</span>
      <span className="sr-only">{t(`kinds.${now.kind}`)}</span>
    </p>
  );
}

/**
 * "Шом ба хайр, Фарангис" — the one line on the portal addressed to the
 * person reading it, and the one thing they most likely came to do.
 *
 * The greeting is set in the serif in warm white, the name in brass. The
 * server chooses the first greeting from the school's clock; a page left open
 * across six o'clock should not go on wishing a good afternoon, so the card
 * looks at the clock again every minute. The weather comes as a promise the
 * page does not wait for: the card is drawn at once and the line joins it.
 */
export function GreetingCard({
  name,
  timeZone,
  initialPart,
  dateLine,
  actions,
  weather,
}: {
  name: string;
  timeZone?: string;
  initialPart: DayPart;
  dateLine?: string;
  actions?: ReactNode;
  /** The weather in Istaravshan, not waited for (weather.ts). */
  weather?: Promise<Weather | null>;
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
        <div className="greeting-top">
          {dateLine ? <p className="greeting-date">{dateLine}</p> : null}
          {weather ? (
            <Suspense fallback={null}>
              <WeatherLine part={part} weather={weather} />
            </Suspense>
          ) : null}
        </div>
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
