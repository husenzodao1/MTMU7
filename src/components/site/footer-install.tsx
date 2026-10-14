"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * "Install the app", over the site's foot line: a small pill with a bare
 * arrow into a tray, to the page that shows how on Android, iPhone and
 * Windows (/app). On that page itself there is nowhere for it to go, so it
 * is not there.
 */
export function FooterInstall({ label }: { label: string }) {
  const pathname = usePathname();
  if (pathname === "/app") return null;
  return (
    <Link href="/app" className="footer-install">
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M12 4.5v9.5" />
        <path d="m8.25 10.5 3.75 3.75 3.75-3.75" />
        <path d="M5 15.5v2.25c0 .97.78 1.75 1.75 1.75h10.5c.97 0 1.75-.78 1.75-1.75V15.5" />
      </svg>
      {label}
    </Link>
  );
}
