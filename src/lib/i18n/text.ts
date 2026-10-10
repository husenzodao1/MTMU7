export const LOCALES = ["tg", "ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "tg";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** A value stored per language, e.g. name_tg / name_ru / name_en columns. */
export interface LocalizedText {
  tg: string | null;
  ru: string | null;
  en: string | null;
}

/** Picks the requested language, falling back to Tajik, Russian, then English. */
export function pickText(text: Partial<LocalizedText> | null | undefined, locale: Locale): string {
  if (!text) return "";
  const order: Locale[] = [locale, "tg", "ru", "en"];
  for (const key of order) {
    const value = text[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return "";
}

/** Builds LocalizedText from a row with `<prefix>_tg|ru|en` columns. */
export function localizedFrom(row: Record<string, unknown> | null | undefined, prefix: string): LocalizedText {
  const read = (suffix: Locale) => {
    const value = row?.[`${prefix}_${suffix}`];
    return typeof value === "string" ? value : null;
  };
  return { tg: read("tg"), ru: read("ru"), en: read("en") };
}

export function pickLocalized(row: Record<string, unknown> | null | undefined, prefix: string, locale: Locale): string {
  return pickText(localizedFrom(row, prefix), locale);
}

/** Picks a localized name from a row with name_tg / name_ru / name_en columns. */
export function pickName(
  row: { name_tg?: string | null; name_ru?: string | null; name_en?: string | null } | null | undefined,
  locale: Locale
): string {
  if (!row) return "";
  return pickText({ tg: row.name_tg ?? null, ru: row.name_ru ?? null, en: row.name_en ?? null }, locale);
}

export const INTL_LOCALE: Record<Locale, string> = {
  tg: "tg-TJ",
  ru: "ru-RU",
  en: "en-GB",
};
