import { getLocale, getTranslations } from "next-intl/server";
import { setLocaleAction } from "@/app/actions/session";
import { LOCALES } from "@/lib/i18n/text";
import { cn } from "@/lib/utils/cn";

/** National flag shown on the language chips; decorative next to the label. */
const FLAG: Record<string, string> = { tg: "/flags/tj.svg", ru: "/flags/ru.svg", en: "/flags/en.svg" };
const SHORT: Record<string, string> = { tg: "ТҶ", ru: "РУ", en: "EN" };

/**
 * Language chooser. `tone="onDark"` is for the government strip, where the
 * waving-flag photograph sits behind the controls.
 */
export async function LocaleSwitcher({ className, tone = "default" }: { className?: string; tone?: "default" | "onDark" }) {
  const locale = await getLocale();
  const t = await getTranslations("common");
  const onDark = tone === "onDark";

  return (
    <div className={cn("flex items-center gap-1", className)} role="group" aria-label={t("language")}>
      <span
        aria-hidden
        className={cn("mr-0.5 inline-flex size-4 shrink-0 items-center justify-center", onDark ? "text-white/70" : "text-ink-muted")}
      >
        {/* globe: marks the row as the language control without adding words */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-4">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" strokeLinecap="round" />
        </svg>
      </span>
      {LOCALES.map((code) => {
        const active = locale === code;
        return (
          <form key={code} action={setLocaleAction}>
            <input type="hidden" name="locale" value={code} />
            <button
              type="submit"
              lang={code}
              aria-pressed={active}
              title={t(`locales.${code}`)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium transition-colors",
                onDark
                  ? active
                    ? "bg-white/20 text-white ring-1 ring-white/40"
                    : "text-white/75 hover:bg-white/10 hover:text-white"
                  : active
                    ? "bg-brand-50 text-brand-text-strong ring-1 ring-brand-300"
                    : "text-ink-secondary hover:bg-surface-muted hover:text-ink"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static 1KB flag, no optimisation needed */}
              <img
                src={FLAG[code]}
                alt=""
                aria-hidden
                width={18}
                height={12}
                className={cn("h-3 w-[18px] shrink-0 rounded-[2px] object-cover", onDark ? "ring-1 ring-white/30" : "ring-1 ring-line")}
              />
              <span>{SHORT[code]}</span>
              <span className="sr-only"> — {t(`locales.${code}`)}</span>
            </button>
          </form>
        );
      })}
    </div>
  );
}
