import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonClasses } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("common.notFound");
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-brand-text tabular">404</p>
        <h1 className="mt-2 text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-ink-secondary">{t("description")}</p>
        <Link href="/" className={buttonClasses("secondary", "md", "mt-6")}>
          {t("home")}
        </Link>
      </div>
    </main>
  );
}
