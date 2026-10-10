// Relative, with its extension, so the unit tests can load this file directly.
import { INTL_LOCALE, type Locale } from "./text.ts";

const DEFAULT_TIME_ZONE = "Asia/Dushanbe";

function safeFormatter<T>(create: (locale: string) => T, locale: Locale): T {
  try {
    return create(INTL_LOCALE[locale]);
  } catch {
    // Some runtimes ship without Tajik locale data; Russian formatting is the closest fallback.
    return create(locale === "tg" ? "ru-RU" : "en-GB");
  }
}

/*
 * Tajik, written out by hand.
 *
 * Node carries Tajik month names; Chrome, Safari and Firefox do not, and they
 * do not say so — tg-TJ quietly becomes American English. A date rendered on
 * the server as "26 Сентябр 2026" then turned into "September 26, 2026" the
 * moment the page came alive, and React threw the whole thread away over the
 * difference. These are the names Node's ICU uses, so the server's output is
 * unchanged and every browser now writes exactly the same.
 */
const TG_MONTHS = ["Январ", "Феврал", "Март", "Апрел", "Май", "Июн", "Июл", "Август", "Сентябр", "Октябр", "Ноябр", "Декабр"];
const TG_MONTHS_SHORT = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

/** Day, month, year, hour and minute of an instant, as numbers, where it happened. */
function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { year: get("year"), month: Number(get("month")), day: Number(get("day")), hour: get("hour").padStart(2, "0").slice(-2), minute: get("minute") };
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
  if (locale === "tg") {
    const p = zonedParts(isDateOnly ? new Date(`${value}T00:00:00Z`) : date, isDateOnly ? "UTC" : timeZone);
    return `${p.day} ${TG_MONTHS[p.month - 1]} ${p.year}`;
  }
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
  if (locale === "tg") {
    const p = zonedParts(isDateOnly ? new Date(`${value}T00:00:00Z`) : date, isDateOnly ? "UTC" : timeZone);
    return `${TG_MONTHS_SHORT[p.month - 1]} ${p.year}`;
  }
  return safeFormatter(
    (l) => new Intl.DateTimeFormat(l, { month: "short", year: "numeric", timeZone: isDateOnly ? "UTC" : timeZone }),
    locale
  ).format(isDateOnly ? new Date(`${value}T00:00:00Z`) : date);
}

export function formatDateTime(value: string | Date | null | undefined, locale: Locale, timeZone = DEFAULT_TIME_ZONE): string {
  const date = toDate(value);
  if (!date) return "—";
  if (locale === "tg") {
    const p = zonedParts(date, timeZone);
    return `${p.day} ${TG_MONTHS_SHORT[p.month - 1]} ${p.year}, ${p.hour}:${p.minute}`;
  }
  return safeFormatter(
    (l) => new Intl.DateTimeFormat(l, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone }),
    locale
  ).format(date);
}

/** Hours and minutes of an instant in the given time zone. */
export function formatClock(value: string | Date | null | undefined, locale: Locale, timeZone = DEFAULT_TIME_ZONE): string {
  const date = toDate(value);
  if (!date) return "";
  if (locale === "tg") {
    const p = zonedParts(date, timeZone);
    return `${p.hour}:${p.minute}`;
  }
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
  // Russian groups and separates exactly as Tajik does (1 234,5), and unlike
  // Tajik it is present in every browser.
  return safeFormatter((l) => new Intl.NumberFormat(locale === "tg" ? "ru-RU" : l, { maximumFractionDigits }), locale).format(number);
}

export function formatPercent(value: number | string | null | undefined, locale: Locale): string {
  if (value === null || value === undefined || value === "") return "—";
  return `${formatNumber(value, locale, 1)}%`;
}

/** ISO date (YYYY-MM-DD) of "today" in the school's time zone. */
export function todayIso(timeZone = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** The hour, 0–23, where the school is. */
export function hourIn(timeZone = DEFAULT_TIME_ZONE, at: Date = new Date()): number {
  // h23, and the remainder besides: some engines still answer "24" for
  // midnight when asked for a 24-hour clock, which would read as daytime.
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(at)) % 24;
}

export type DayPart = "morning" | "day" | "evening" | "night";

/**
 * Which greeting the hour calls for.
 *
 * The boundaries are the ones a Tajik speaker would use: субҳ until noon, рӯз
 * through the afternoon, шом from six, and шаб from ten at night — so somebody
 * opening the portal after supper is not wished good afternoon.
 */
export function dayPart(timeZone = DEFAULT_TIME_ZONE, at: Date = new Date()): DayPart {
  const hour = hourIn(timeZone, at);
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "day";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}
