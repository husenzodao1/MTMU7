/**
 * The themes a person can choose.
 *
 * Every one is the same set of tokens with different values, so nothing in the
 * application knows a theme exists: components ask for `bg-surface` and
 * `text-ink` and get whatever the chosen theme says those are. Adding a theme
 * is a block of CSS and a line here.
 *
 * `system` writes no attribute at all, which is what leaves the media query in
 * charge — that is the default, and the one most people should stay on.
 */
export const THEMES = ["system", "day", "night", "midnight", "verdant"] as const;

export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "system";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** The cookie the root layout reads before the first byte of HTML is sent. */
export const THEME_COOKIE = "theme";

/**
 * Whether a theme is dark, for the browser chrome and for `color-scheme`.
 * `system` is neither, and says so by returning null.
 */
export function themeIsDark(theme: Theme): boolean | null {
  if (theme === "system") return null;
  return theme === "night" || theme === "midnight";
}
