"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { Loader2 } from "lucide-react";

/**
 * The end of a list that keeps going: when this line scrolls into view (inside
 * the list's own box), the next screenful is asked for — the same page with
 * one more page of rows (lib/list-params.ts) — without moving the page or the
 * box. A button does the same where the browser cannot watch the scroll.
 */
export function LoadMore({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  const sentinel = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const asked = useRef<string | null>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const watch = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || asked.current === href) return;
        asked.current = href;
        startTransition(() => router.replace(href, { scroll: false }));
      },
      { rootMargin: "0px 0px 200px 0px" }
    );
    watch.observe(el);
    return () => watch.disconnect();
  }, [href, router]);

  return (
    <div ref={sentinel} className="flex justify-center py-3">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-ink-muted hover:bg-surface-muted hover:text-ink"
        onClick={() => {
          asked.current = href;
          startTransition(() => router.replace(href, { scroll: false }));
        }}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
        {label}
      </button>
    </div>
  );
}
