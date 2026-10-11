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
 * Small, still and in the corner: a plain circle of the page's surface with
 * the brass mark of a conversation, found without asking for attention. It
 * steps aside where it would sit on top of
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
        "fixed end-4 z-40 inline-flex size-12 items-center justify-center rounded-full border border-line bg-surface text-brand-text shadow-sm transition-colors hover:border-line-strong hover:bg-surface-muted sm:end-6 print:hidden",
        aboveBottomBar ? "bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] lg:bottom-6" : "bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:bottom-6"
      )}
    >
      <MessageCircleMore className="size-5" aria-hidden />
    </Link>
  );
}
