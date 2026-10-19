import type { Locale } from "@/lib/i18n/text";

export const MESSAGE_AREAS = ["common", "auth", "site", "portal", "teach", "admin", "errors"] as const;
type Messages = Record<string, unknown>;

function isObject(value: unknown): value is Messages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deep merge: values from `override` win; missing keys fall back to `base`. */
export function mergeMessages(base: Messages, override: Messages): Messages {
  const result: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];
    result[key] = isObject(existing) && isObject(value) ? mergeMessages(existing, value) : value;
  }
  return result;
}

async function loadLocale(locale: Locale): Promise<Messages> {
  const parts = await Promise.all(MESSAGE_AREAS.map((area) => import(`./${locale}/${area}.json`).then((m) => m.default as Messages)));
  return parts.reduce<Messages>((acc, part) => mergeMessages(acc, part), {});
}

/** Messages for a locale with English as the fallback for any missing key. */
export async function loadMessages(locale: Locale): Promise<Messages> {
  const english = await loadLocale("en");
  if (locale === "en") return english;
  return mergeMessages(english, await loadLocale(locale));
}

/**
 * What the browser is sent on every page: everything but the office's words
 * (the "admin" area — nearly half the total), which only the office's pages
 * and the forms it lends to a class teacher are sent (office-words.tsx).
 */
export function withoutOffice<T extends Messages>(messages: T): T {
  const rest = { ...messages };
  delete rest.admin;
  return rest;
}
