export const locales = ["tg", "ru"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "tg";
