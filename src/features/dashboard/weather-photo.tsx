import Image, { type StaticImageData } from "next/image";
import clearDay from "@/features/dashboard/weather-photos/clear-day.webp";
import clearEvening from "@/features/dashboard/weather-photos/clear-evening.webp";
import clearMorning from "@/features/dashboard/weather-photos/clear-morning.webp";
import clearNight from "@/features/dashboard/weather-photos/clear-night.webp";
import cloudyDay from "@/features/dashboard/weather-photos/cloudy-day.webp";
import fog from "@/features/dashboard/weather-photos/fog.webp";
import nightClouds from "@/features/dashboard/weather-photos/night-clouds.webp";
import partlyDay from "@/features/dashboard/weather-photos/partly-day.webp";
import rainDay from "@/features/dashboard/weather-photos/rain-day.webp";
import rainNight from "@/features/dashboard/weather-photos/rain-night.webp";
import snowDay from "@/features/dashboard/weather-photos/snow-day.webp";
import snowNight from "@/features/dashboard/weather-photos/snow-night.webp";
import storm from "@/features/dashboard/weather-photos/storm.webp";
import { photoFor, type WeatherKind, type WeatherPhotoName } from "@/features/dashboard/weather-kind";
import type { DayPart } from "@/lib/i18n/format";

/**
 * The greeting card's sky: a photograph for the hour and the weather in
 * Istaravshan (photoFor in weather-kind.ts) — a sunrise over a misty valley,
 * snow on the pines, the Milky Way over the peaks — darkened and softened so
 * the greeting reads over it, drifting very slowly closer (motion.css, "the
 * greeting's sky"). Falling snow, a fog bank and a storm's flashes move over
 * their photographs.
 *
 * The photographs are from Pexels (free to use, no credit asked: pexels.com/license),
 * 2560 px wide; Next.js serves each screen the size it needs, and a blurred
 * copy shows the moment the card does, until the sharp one has come.
 */

const PHOTOS: Record<WeatherPhotoName, StaticImageData> = {
  "clear-morning": clearMorning,
  "clear-day": clearDay,
  "clear-evening": clearEvening,
  "clear-night": clearNight,
  "partly-day": partlyDay,
  "night-clouds": nightClouds,
  "cloudy-day": cloudyDay,
  fog,
  "rain-day": rainDay,
  "rain-night": rainNight,
  "snow-day": snowDay,
  "snow-night": snowNight,
  storm,
};

export function WeatherPhoto({ part, kind }: { part: DayPart; kind: WeatherKind | null }) {
  const name = photoFor(part, kind);
  return (
    <div className="photo-sky" data-photo={name} aria-hidden>
      <Image
        key={name}
        src={PHOTOS[name]}
        alt=""
        fill
        placeholder="blur"
        sizes="(min-width: 1344px) 1290px, (min-width: 1024px) calc(100vw - 19rem), 100vw"
        className="photo-sky-img"
      />
      <div className="photo-sky-shade" />
      {kind === "snow" ? (
        <div className="sky-snow">
          <i />
          <i />
        </div>
      ) : null}
      {kind === "fog" ? (
        <div className="sky-fog">
          <i />
          <i />
          <i />
        </div>
      ) : null}
      {kind === "storm" ? <div className="sky-storm" /> : null}
    </div>
  );
}
