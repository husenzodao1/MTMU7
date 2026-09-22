import { OfficialStrip, SiteFooter } from "@/components/site/official-header";

/**
 * Chrome for the authentication pages: the government strip on top, the card
 * centred over a quietened photograph of the school, the site footer below.
 * The photograph sits only behind the card area and is held far enough back
 * that the card's own contrast is untouched.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <OfficialStrip />
      <main
        id="main"
        tabIndex={-1}
        className="relative isolate flex flex-1 items-center justify-center px-4 py-10 focus:outline-none sm:py-14"
      >
        <div aria-hidden className="absolute inset-0 -z-30 bg-canvas" />
        <div
          aria-hidden
          className="absolute inset-0 -z-20 bg-[url('/images/school-bg.webp')] bg-cover bg-center opacity-[0.12]"
        />
        {/* Calms the edges so the photograph never competes with the card. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,transparent_35%,var(--color-canvas)_100%)]"
        />
        <div className="w-full max-w-md">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
