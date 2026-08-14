export const locales = ["tg", "ru", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "tg";
