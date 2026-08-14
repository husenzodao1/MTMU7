import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("landing");

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-bold text-primary-700">
            МТМУ №7
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              {t("login")}
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors press-scale"
            >
              {t("register")}
            </Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-neutral-200 bg-neutral-50 py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-neutral-500">
          © {new Date().getFullYear()} МТМУ №7
        </div>
      </footer>
    </div>
  );
}
