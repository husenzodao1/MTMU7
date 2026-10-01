import { getLocale, getTranslations } from "next-intl/server";
import { setLocaleAction } from "@/app/actions/session";
import { LOCALES } from "@/lib/i18n/text";
import { cn } from "@/lib/utils/cn";

/** National flag shown on the language chips; decorative next to the label. */
const FLAG: Record<string, string> = { tg: "/flags/tj.svg", ru: "/flags/ru.svg", en: "/flags/en.svg" };

/**
 * Latin for all three, because the row has to read as one set.
 *
 * «ТҶ РУ EN» mixes two alphabets in four centimetres and the Cyrillic pair
 * reads as words while the third reads as a code. TJ RU ENG is what every
 * airport and form in the country uses.
 */
const SHORT: Record<string, string> = { tg: "TJ", ru: "RU", en: "ENG" };

function Globe({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" strokeLinecap="round" />
    </svg>
  );
}

async function Chips({ onDark, stacked }: { onDark: boolean; stacked?: boolean }) {
  const locale = await getLocale();
  const t = await getTranslations("common");

  return (
    <>
      {LOCALES.map((code) => {
        const active = locale === code;
        return (
          <form key={code} action={setLocaleAction} className={stacked ? "w-full" : undefined}>
            <input type="hidden" name="locale" value={code} />
            <button
              type="submit"
              lang={code}
              aria-pressed={active}
              title={t(`locales.${code}`)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium transition-colors",
                stacked && "w-full gap-2 px-2 py-1.5 text-start",
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
              <span className="tabular">{SHORT[code]}</span>
              {stacked ? <span className="text-ink-secondary">{t(`locales.${code}`)}</span> : null}
              <span className="sr-only"> — {t(`locales.${code}`)}</span>
            </button>
          </form>
        );
      })}
    </>
  );
}

/**
 * Language chooser. `tone="onDark"` is for the government strip, where the
 * waving-flag photograph sits behind the controls.
 *
 * On a phone the three chips took the width the ministry's name needed, so the
 * name was cut off mid-word. There, the control folds into the globe alone and
 * opens on a tap — plain <details>, so it works before any JavaScript runs and
 * closes on Escape without being told to.
 */
export async function LocaleSwitcher({ className, tone = "default" }: { className?: string; tone?: "default" | "onDark" }) {
  const t = await getTranslations("common");
  const onDark = tone === "onDark";

  return (
    <>
      {/* Phones: the globe, and the three languages under it. */}
      <details className={cn("group relative sm:hidden", className)}>
        <summary
          aria-label={t("language")}
          className={cn(
            "flex size-8 cursor-pointer list-none items-center justify-center rounded-md transition-colors [&::-webkit-details-marker]:hidden",
            onDark ? "text-white/80 hover:bg-white/10 hover:text-white" : "text-ink-secondary hover:bg-surface-muted hover:text-ink"
          )}
        >
          <Globe className="size-4" />
        </summary>
        <div
          role="group"
          aria-label={t("language")}
          className="absolute end-0 z-30 mt-1 flex w-44 flex-col gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-lg"
        >
          {/* Inside the panel the chips sit on the page, never on the flag. */}
          <Chips onDark={false} stacked />
        </div>
      </details>

      {/* Anything wider: all three at once, no tap needed. */}
      <div className={cn("hidden items-center gap-1 sm:flex", className)} role="group" aria-label={t("language")}>
        <span aria-hidden className={cn("mr-0.5 inline-flex size-4 shrink-0 items-center justify-center", onDark ? "text-white/70" : "text-ink-muted")}>
          <Globe className="size-4" />
        </span>
        <Chips onDark={onDark} />
      </div>
    </>
  );
}
