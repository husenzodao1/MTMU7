import { Unbounded } from "next/font/google";
import { OfficialStrip, SiteFooter } from "@/components/site/official-header";
import { getAuthSchool, safeImageUrl } from "@/lib/site/auth-school";

/**
 * The digits of the emailed code: wide, round and weighty, so six numbers
 * read at a glance as one thing to copy. Digits only — the latin subset is
 * all it needs — and not preloaded, because only the code screens draw it.
 */
const codeDigits = Unbounded({
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
  preload: false,
  variable: "--font-code",
});

/** Shown when the chosen school has no photograph of its own. */
const FALLBACK_BACKGROUND = "/images/school-bg.webp";

/**
 * Chrome for the authentication pages: the government strip on top, the card
 * centred over a quietened photograph of the school being signed in to, the
 * site footer below. The photograph sits only behind the card area and is held
 * far enough back that the card's own contrast is untouched.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const school = await getAuthSchool();
  const background = safeImageUrl(school?.photoUrl) ?? FALLBACK_BACKGROUND;

  return (
    <div className={`${codeDigits.variable} flex min-h-dvh flex-col`}>
      <OfficialStrip />
      <main
        id="main"
        tabIndex={-1}
        className="relative isolate flex flex-1 items-center justify-center px-4 py-10 focus:outline-none sm:py-14"
      >
        <div aria-hidden className="absolute inset-0 -z-30 bg-canvas" />
        <div
          aria-hidden
          className="absolute inset-0 -z-20 bg-cover bg-center opacity-40"
          style={{ backgroundImage: `url("${background}")` }}
        />
        {/* Calms the edges so the photograph never competes with the card. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,transparent_45%,var(--color-canvas)_100%)]"
        />
        <div className="w-full max-w-md">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
