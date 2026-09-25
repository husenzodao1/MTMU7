import { INTL_LOCALE, type Locale } from "@/lib/i18n/text";

const DEFAULT_TIME_ZONE = "Asia/Dushanbe";

function safeFormatter<T>(create: (locale: string) => T, locale: Locale): T {
  try {
    return create(INTL_LOCALE[locale]);
  } catch {
    // Some runtimes ship without Tajik locale data; Russian formatting is the closest fallback.
    return create(locale === "tg" ? "ru-RU" : "en-GB");
  }
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | Date | null | undefined, locale: Locale, timeZone = DEFAULT_TIME_ZONE): string {
  const date = toDate(value);
  if (!date) return "—";
  const isDateOnly = typeof value === "string" && value.length === 10;
  return safeFormatter(
    (l) => new Intl.DateTimeFormat(l, { day: "numeric", month: "long", year: "numeric", timeZone: isDateOnly ? "UTC" : timeZone }),
    locale
  ).format(isDateOnly ? new Date(`${value}T00:00:00Z`) : date);
}

/**
 * The all-numeric date: 22.09.2026 on every Tajik school form there is.
 *
 * ICU carries Tajik month and weekday names — Сентябр, Сешанбе — but no
 * numeric pattern, so tg-TJ quietly falls back to 22/09/2026. It does not
 * throw, so safeFormatter never notices. Russian is asked for the pattern
 * instead: day first, dots, and not one word that could be Russian, because
 * there are no words in it.
 */
export function formatShortDate(value: string | Date | null | undefined, locale: Locale, timeZone = DEFAULT_TIME_ZONE): string {
  const date = toDate(value);
  if (!date) return "—";
  const isDateOnly = typeof value === "string" && value.length === 10;
  return safeFormatter(
    (l) =>
      new Intl.DateTimeFormat(locale === "tg" ? "ru-RU" : l, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: isDateOnly ? "UTC" : timeZone,
      }),
    locale
  ).format(isDateOnly ? new Date(`${value}T00:00:00Z`) : date);
}

/** "Sep 2026" — month and year, for series grouped by month. */
export function formatMonth(value: string | Date | null | undefined, locale: Locale, timeZone = DEFAULT_TIME_ZONE): string {
  const date = toDate(value);
  if (!date) return "—";
  const isDateOnly = typeof value === "string" && value.length === 10;
  return safeFormatter(
    (l) => new Intl.DateTimeFormat(l, { month: "short", year: "numeric", timeZone: isDateOnly ? "UTC" : timeZone }),
    locale
  ).format(isDateOnly ? new Date(`${value}T00:00:00Z`) : date);
}

export function formatDateTime(value: string | Date | null | undefined, locale: Locale, timeZone = DEFAULT_TIME_ZONE): string {
  const date = toDate(value);
  if (!date) return "—";
  return safeFormatter(
    (l) => new Intl.DateTimeFormat(l, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone }),
    locale
  ).format(date);
}

/** Hours and minutes of an instant in the given time zone. */
export function formatClock(value: string | Date | null | undefined, locale: Locale, timeZone = DEFAULT_TIME_ZONE): string {
  const date = toDate(value);
  if (!date) return "";
  return safeFormatter((l) => new Intl.DateTimeFormat(l, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }), locale).format(date);
}

/** Calendar day (YYYY-MM-DD) of an instant in the given time zone, for grouping. */
export function dayKey(value: string | Date, timeZone = DEFAULT_TIME_ZONE): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 5);
}

export function formatNumber(value: number | string | null | undefined, locale: Locale, maximumFractionDigits = 1): string {
  if (value === null || value === undefined || value === "") return "—";
  const number = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(number)) return "—";
  return safeFormatter((l) => new Intl.NumberFormat(l, { maximumFractionDigits }), locale).format(number);
}

export function formatPercent(value: number | string | null | undefined, locale: Locale): string {
  if (value === null || value === undefined || value === "") return "—";
  return `${formatNumber(value, locale, 1)}%`;
}

/** ISO date (YYYY-MM-DD) of "today" in the school's time zone. */
export function todayIso(timeZone = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
