import "server-only";
import { ISTARAVSHAN, weatherFromForecast, type Weather } from "@/features/dashboard/weather-kind";

/** A quarter of an hour: the sky does not change faster than that on a card. */
const FRESH_FOR_SECONDS = 900;

/**
 * The weather in Istaravshan now, from Open-Meteo (no key, no account), kept
 * for a quarter of an hour so a whole school opening the portal at eight asks
 * once. Never in the way: the dashboard hands this promise to the greeting
 * card without waiting for it, and an answer that is slow, wrong or missing is
 * simply no weather — the card's sky follows the clock alone.
 */
export async function getIstaravshanWeather(): Promise<Weather | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(ISTARAVSHAN.latitude));
  url.searchParams.set("longitude", String(ISTARAVSHAN.longitude));
  url.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m");
  url.searchParams.set("timezone", "Asia/Dushanbe");
  try {
    const response = await fetch(url, { next: { revalidate: FRESH_FOR_SECONDS }, signal: AbortSignal.timeout(3000) });
    if (!response.ok) return null;
    return weatherFromForecast(await response.json());
  } catch {
    return null;
  }
}
