/**
 * What the sky over Istaravshan is doing, in the few kinds the greeting card
 * shows (weather-photo.tsx), read from an Open-Meteo answer, and which of the
 * card's photographs fits it at which hour.
 *
 * Pure, so it is tested without the network.
 */

/** Where the hour stands, as the greeting has it (lib/i18n/format.ts). */
type Part = "morning" | "day" | "evening" | "night";

export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export interface Weather {
  kind: WeatherKind;
  /** °C, rounded. */
  temperature: number;
  /** km/h at ten metres. */
  wind: number;
  /** Wind strong enough to lean the grass over and send streaks across. */
  windy: boolean;
}

/** The town the school is in. */
export const ISTARAVSHAN = { latitude: 39.9108, longitude: 69.0064 } as const;

/** From about here the grass bends and the clouds hurry. */
const WINDY_KMH = 22;

/**
 * The WMO weather code Open-Meteo reports, as a kind of sky.
 * https://open-meteo.com/en/docs — "WMO Weather interpretation codes".
 */
export function kindFromCode(code: number): WeatherKind {
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95 && code <= 99) return "storm";
  return "clear";
}

/** Open-Meteo's `current` block, or null when the answer is not one. */
export function weatherFromForecast(body: unknown): Weather | null {
  const current = (body as { current?: Record<string, unknown> } | null)?.current;
  if (!current) return null;
  const code = Number(current.weather_code);
  const temperature = Number(current.temperature_2m);
  const wind = Number(current.wind_speed_10m);
  if (!Number.isFinite(code) || !Number.isFinite(temperature)) return null;
  const windKmh = Number.isFinite(wind) ? Math.max(0, wind) : 0;
  return { kind: kindFromCode(code), temperature: Math.round(temperature), wind: Math.round(windKmh), windy: windKmh >= WINDY_KMH };
}

export const WEATHER_KINDS: readonly WeatherKind[] = ["clear", "partly", "cloudy", "fog", "drizzle", "rain", "snow", "storm"];

export function isWeatherKind(value: unknown): value is WeatherKind {
  return typeof value === "string" && (WEATHER_KINDS as readonly string[]).includes(value);
}

/** The greeting card's photographs (src/features/dashboard/weather-photos/). */
export const WEATHER_PHOTOS = [
  "clear-morning",
  "clear-day",
  "clear-evening",
  "clear-night",
  "partly-day",
  "night-clouds",
  "cloudy-day",
  "fog",
  "rain-day",
  "rain-night",
  "snow-day",
  "snow-night",
  "storm",
] as const;
export type WeatherPhotoName = (typeof WEATHER_PHOTOS)[number];

/**
 * The photograph for this hour and this sky. Without the weather (not come
 * yet, or the forecast failed) the hour's clear sky. A sunrise or a sunset
 * stays one under a few clouds; after dark any cloud is the moon behind them.
 */
export function photoFor(part: Part, kind: WeatherKind | null): WeatherPhotoName {
  const dark = part === "night";
  const dusk = part === "evening" || dark;
  switch (kind ?? "clear") {
    case "clear":
      return `clear-${part}`;
    case "partly":
      return dark ? "night-clouds" : part === "day" ? "partly-day" : `clear-${part}`;
    case "cloudy":
      return dark ? "night-clouds" : "cloudy-day";
    case "fog":
      return "fog";
    case "drizzle":
    case "rain":
      return dusk ? "rain-night" : "rain-day";
    case "snow":
      return dusk ? "snow-night" : "snow-day";
    case "storm":
      return "storm";
  }
}
