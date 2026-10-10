import "server-only";
import { GREETING_PATHS, type ScriptLine } from "@/features/intro/greeting-paths";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/text";

/**
 * The handwritten lines for a language. Read on the server only, so the
 * letters' outlines travel with the one page that shows them and never sit in
 * the portal's JavaScript.
 */
const greeting = (locale: string) => GREETING_PATHS[isLocale(locale) ? locale : DEFAULT_LOCALE];

/** The opening: "Ассалому алайкум", then "Хуш омадед". */
export const openingScript = (locale: string): ScriptLine[] => [greeting(locale).hello, greeting(locale).welcome];

/** After signing in: "Хуш омадед", with the name written under it. */
export const welcomeScript = (locale: string): ScriptLine => greeting(locale).welcome;
