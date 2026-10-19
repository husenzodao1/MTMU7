import { DEFAULT_THEME, THEME_COOKIE, THEMES, themeIsDark, type Theme } from "@/lib/theme";

/**
 * How the portal looks on this device — its colours (lib/theme.ts) and the
 * size of its type — kept in cookies, so the server draws a page that way to
 * begin with, and put on the page by the page itself as it arrives
 * (PREFS_SCRIPT), so a page the device kept from before a change (public/sw.js)
 * opens the new way too. A change is made on the page in front at once, with
 * nothing fetched again.
 */

/** The cookie holding the size of the type, 1 to TEXT_SIZES. */
export const TEXT_SIZE_COOKIE = "text-size";
export const TEXT_SIZES = 10;
/** The size the portal is drawn at by default: the fourth step of ten. */
export const DEFAULT_TEXT_SIZE = 4;
/** The share of the default size each step draws the type at (globals.css, --text-scale). */
export const TEXT_SCALES = [0.85, 0.9, 0.95, 1, 1.06, 1.12, 1.18, 1.25, 1.33, 1.42] as const;

export function asTextSize(value: unknown): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= TEXT_SIZES ? n : DEFAULT_TEXT_SIZE;
}

/** The colours the phone's bars take with a theme (layout.tsx, generateViewport). */
export const LIGHT_BARS = "#f4f2ec";
export const DARK_BARS = "#0a0e17";

const YEAR = 60 * 60 * 24 * 365;

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; Path=/; Max-Age=${YEAR}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

/** The theme on the page in front, now, and on every page from here on. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  writeCookie(THEME_COOKIE, theme);
  // The phone's own bars follow.
  const dark = themeIsDark(theme);
  for (const meta of Array.from(document.querySelectorAll('meta[name="theme-color"]'))) meta.remove();
  const add = (color: string, media?: string) => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = color;
    if (media) meta.media = media;
    document.head.appendChild(meta);
  };
  if (dark === null) {
    add(LIGHT_BARS, "(prefers-color-scheme: light)");
    add(DARK_BARS, "(prefers-color-scheme: dark)");
  } else add(dark ? DARK_BARS : LIGHT_BARS);
}

/** The size of the type, now and from here on. */
export function applyTextSize(size: number) {
  const level = asTextSize(size);
  if (level === DEFAULT_TEXT_SIZE) document.documentElement.removeAttribute("data-text-size");
  else document.documentElement.setAttribute("data-text-size", String(level));
  writeCookie(TEXT_SIZE_COOKIE, String(level));
}

/**
 * Inline, first thing in the page: the theme and the size from the cookies,
 * whatever the page was drawn with — a copy kept on the device before they
 * were changed is shown the new way, before anything is painted.
 */
export const PREFS_SCRIPT = `(function(){try{var d=document.documentElement,c=document.cookie;
var t=/(?:^|; )THEME_COOKIE=([a-z]+)/.exec(c),th=t?t[1]:'DEFAULT_THEME';
if(THEMES.indexOf(th)<0)th='DEFAULT_THEME';
if(th==='system')d.removeAttribute('data-theme');else d.setAttribute('data-theme',th);
var s=/(?:^|; )TEXT_SIZE_COOKIE=(\\d+)/.exec(c),n=s?+s[1]:DEFAULT_TEXT_SIZE;
if(n>=1&&n<=TEXT_SIZES&&n!==DEFAULT_TEXT_SIZE)d.setAttribute('data-text-size',String(n));else d.removeAttribute('data-text-size');
}catch(e){}})()`
  .replace("THEME_COOKIE", THEME_COOKIE)
  .replaceAll("DEFAULT_THEME", DEFAULT_THEME)
  .replace("THEMES", JSON.stringify(THEMES))
  .replace("TEXT_SIZE_COOKIE", TEXT_SIZE_COOKIE)
  .replaceAll("DEFAULT_TEXT_SIZE", String(DEFAULT_TEXT_SIZE))
  .replace("TEXT_SIZES", String(TEXT_SIZES));
