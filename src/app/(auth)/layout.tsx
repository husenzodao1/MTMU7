import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { OfficialStrip, SiteFooter } from "@/components/site/official-header";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("common");
  return (
    <div className="flex min-h-dvh flex-col">
      <OfficialStrip />
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
          <Link href="/" className="text-base font-semibold text-ink hover:text-brand-text">
            {t("platformName")}
          </Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex flex-1 justify-center px-4 py-8 focus:outline-none sm:py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
