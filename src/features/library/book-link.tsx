"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/** How long the book takes to riffle and open before its page is shown. */
const OPENING_MS = 460;

/**
 * A book on the shelf that opens when it is chosen: its pages riffle, then
 * the cover swings open (motion.css, "opening a book"), and only then does
 * its page come — already fetched, since the link was prefetched as it came
 * into view. A click with a modifier, or for whoever asks for less motion,
 * goes straight there.
 */
export function BookLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      className={className}
      onClick={(event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        event.preventDefault();
        const card = event.currentTarget;
        if (card.hasAttribute("data-opening")) return;
        card.setAttribute("data-opening", "");
        router.prefetch(href);
        window.setTimeout(() => {
          router.push(href);
          // If the page is slow, the book closes again rather than hanging open.
          window.setTimeout(() => card.removeAttribute("data-opening"), 1200);
        }, OPENING_MS);
      }}
    >
      {children}
    </Link>
  );
}
