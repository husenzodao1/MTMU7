import { SiteFooter } from "@/components/site/official-header";

/** The public pages. The ministry strip is the front page's alone (page.tsx). */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-canvas flex-col">
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
