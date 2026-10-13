"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** When each page was last fetched ahead of a tap, by path. */
const warmedAt = new Map<string, number>();

/** A page shown from a copy older than this is asked for again, quietly, once it is on screen. */
const FRESH_MS = 60_000;
/** Between one page fetched ahead and the next, so a slow line is never flooded. */
const SPACING_MS = 450;

type Router = ReturnType<typeof useRouter>;
/** The whole page, data and all — not only the frame a `<Link>` fetches by itself. */
const WHOLE = "full" as unknown as NonNullable<Parameters<Router["prefetch"]>[1]>["kind"];

/**
 * Fetches a page ahead of any tap, whole — its data as well as its frame — so
 * that the tap shows it at once from the phone's memory. Next.js calls back
 * when that copy has grown old (staleTimes.static, next.config.ts), and it is
 * fetched again then, so the copy is always there and never very old.
 */
export function warmPage(router: Router, href: string, keep: () => boolean = () => true) {
  warmedAt.set(href, Date.now());
  router.prefetch(href, {
    kind: WHOLE,
    onInvalidate: () => {
      if (keep()) window.setTimeout(() => keep() && warmPage(router, href, keep), 1500 + Math.random() * 3000);
    },
  });
}

/**
 * Every page in `hrefs` kept ready on the device, the way an app keeps its
 * screens: fetched one after another once the page in front is idle, and
 * again whenever a copy grows old. A page that is then opened from a copy
 * more than a minute old is shown at once and refreshed behind it, so what is
 * on screen is current a moment later without anybody waiting for it.
 */
export function useWarmPages(hrefs: string[], pathname: string) {
  const router = useRouter();
  const key = [...new Set(hrefs)].join("|");

  useEffect(() => {
    let live = true;
    const list = key.split("|").filter(Boolean);
    let index = 0;
    let timer = 0;
    const next = () => {
      if (!live || index >= list.length) return;
      warmPage(router, list[index++]!, () => live);
      timer = window.setTimeout(next, SPACING_MS);
    };
    const begin = window.setTimeout(() => {
      const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 300));
      idle(() => next());
    }, 600);
    return () => {
      live = false;
      window.clearTimeout(begin);
      window.clearTimeout(timer);
    };
  }, [key, router]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const at = warmedAt.get(pathname);
    if (!at || Date.now() - at < FRESH_MS || !navigator.onLine) return;
    const timer = window.setTimeout(() => {
      warmedAt.set(pathname, Date.now());
      router.refresh();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [pathname, router]);
}
