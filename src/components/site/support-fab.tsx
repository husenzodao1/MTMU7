"use client";

import { MessageCircleMore } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { isPortalPath } from "@/lib/security/routes";
import { cn } from "@/lib/utils/cn";

/**
 * The way to the support desk, on every page of the site.
 *
 * Small and in the corner, with a ripple leaving it now and then so it is
 * found without being loud. It steps aside where it would sit on top of
 * something: in the messenger, where the corner is the send button and the
 * support conversation is already in the list, and on the support pages
 * themselves. On a phone inside the portal it floats above the bottom bar
 * rather than over it.
 */
export function SupportFab() {
  const t = useTranslations("common.support");
  const pathname = usePathname();

  if (pathname.startsWith("/support") || pathname.startsWith("/messages") || pathname.startsWith("/dev-preview")) {
    return null;
  }
  const aboveBottomBar = isPortalPath(pathname) && !pathname.startsWith("/admin");

  return (
    <Link
      href="/support"
      aria-label={t("open")}
      title={t("open")}
      className={cn(
        "support-fab fixed end-4 z-40 inline-flex size-13 items-center justify-center rounded-full bg-brand-solid text-brand-on-solid shadow-overlay transition-transform hover:scale-105 active:scale-95 sm:end-6 print:hidden",
        aboveBottomBar ? "bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] lg:bottom-6" : "bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:bottom-6"
      )}
    >
      <MessageCircleMore className="size-6" aria-hidden />
    </Link>
  );
}
