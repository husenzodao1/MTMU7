import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { setThemeAction } from "@/app/actions/session";
import { DEFAULT_THEME, isTheme, THEME_COOKIE, THEMES, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils/cn";

/**
 * A swatch per theme: two circles showing the page and the thing you press.
 *
 * No words for the colours — a name for a colour is a translation problem and
 * a guess, and the swatch says it better than "warm dark" ever would. The name
 * underneath says what it is for, which is the part that needs words.
 */
const SWATCH: Record<Theme, { page: string; accent: string }> = {
  system: { page: "linear-gradient(135deg, #f4f5f7 50%, #0e1317 50%)", accent: "#e3a130" },
  day: { page: "#f4f5f7", accent: "#e3a130" },
  night: { page: "#0e1317", accent: "#d9962b" },
  midnight: { page: "#0a0a0c", accent: "#bd8526" },
  verdant: { page: "#f4f5f7", accent: "#1f7a3e" },
  // The three that follow the device show both halves, like "system" does.
  ocean: { page: "linear-gradient(135deg, #f4f5f7 50%, #0e1317 50%)", accent: "#1f68be" },
  graphite: { page: "linear-gradient(135deg, #f4f5f7 50%, #0e1317 50%)", accent: "#1f252c" },
  lavender: { page: "linear-gradient(135deg, #f4f5f7 50%, #0e1317 50%)", accent: "#6545c0" },
};

export async function ThemeSwitcher({ className }: { className?: string }) {
  const t = await getTranslations("common.themes");
  const cookieTheme = (await cookies()).get(THEME_COOKIE)?.value;
  const current = isTheme(cookieTheme) ? cookieTheme : DEFAULT_THEME;

  return (
    <div className={cn("grid gap-2 sm:grid-cols-2 lg:grid-cols-3", className)} role="group" aria-label={t("label")}>
      {THEMES.map((theme) => {
        const active = theme === current;
        const swatch = SWATCH[theme];
        return (
          <form key={theme} action={setThemeAction}>
            <input type="hidden" name="theme" value={theme} />
            <button
              type="submit"
              aria-pressed={active}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-start transition-colors",
                active
                  ? "border-brand-300 bg-brand-50 ring-1 ring-brand-300"
                  : "border-line bg-surface hover:border-line-strong hover:bg-surface-muted"
              )}
            >
              <span
                aria-hidden
                className="relative size-8 shrink-0 rounded-full border border-line-strong"
                style={{ background: swatch.page }}
              >
                <span
                  className="absolute bottom-0 end-0 size-3.5 rounded-full border-2 border-surface"
                  style={{ background: swatch.accent }}
                />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{t(`${theme}.name`)}</span>
                <span className="block truncate text-xs text-ink-muted">{t(`${theme}.hint`)}</span>
              </span>
            </button>
          </form>
        );
      })}
    </div>
  );
}
