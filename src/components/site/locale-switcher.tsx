import { getLocale, getTranslations } from "next-intl/server";
import { setLocaleAction } from "@/app/actions/session";
import { LOCALES } from "@/lib/i18n/text";
import { cn } from "@/lib/utils/cn";

export async function LocaleSwitcher({ className }: { className?: string }) {
  const locale = await getLocale();
  const t = await getTranslations("common");
  return (
    <div className={cn("flex items-center gap-1", className)} role="group" aria-label={t("language")}>
      {LOCALES.map((code) => (
        <form key={code} action={setLocaleAction}>
          <input type="hidden" name="locale" value={code} />
          <button
            type="submit"
            lang={code}
            aria-pressed={locale === code}
            className={cn(
              "rounded-md px-2 py-1 text-sm",
              locale === code ? "bg-brand-50 font-semibold text-brand-text-strong" : "text-ink-secondary hover:bg-surface-muted hover:text-ink"
            )}
          >
            {code === "tg" ? "ТҶ" : code === "ru" ? "РУ" : "EN"}
            <span className="sr-only"> — {t(`locales.${code}`)}</span>
          </button>
        </form>
      ))}
    </div>
  );
}
