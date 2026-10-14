"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { readInstalled } from "@/lib/kept-pages";

/** When each page was last fetched ahead of a tap, by path. */
const warmedAt = new Map<string, number>();

/** Between one page fetched ahead and the next, so a slow line is never flooded. */
const SPACING_MS = 150;
/** A page fetched ahead this recently is not fetched again for another list. */
const RECENT_MS = 60_000;

type Router = ReturnType<typeof useRouter>;
/** The whole page, data and all — not only the frame a `<Link>` fetches by itself. */
const WHOLE = "full" as unknown as NonNullable<Parameters<Router["prefetch"]>[1]>["kind"];

/**
 * Fetches a page ahead of any tap, whole — its data as well as its frame — so
 * that the tap shows it at once from the phone's memory. Next.js calls back
 * when that copy has grown old (staleTimes, next.config.ts), and it is
 * fetched again then, behind the screen, so the copy is always there.
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

/** A list of pages fetched ahead one after another, any fetched a moment ago left out. */
export function warmPages(router: Router, hrefs: string[], keep: () => boolean = () => true): () => void {
  const list = [...new Set(hrefs)].filter((href) => Date.now() - (warmedAt.get(href) ?? 0) > RECENT_MS);
  let index = 0;
  let timer = 0;
  const next = () => {
    if (!keep() || index >= list.length) return;
    warmPage(router, list[index++]!, keep);
    timer = window.setTimeout(next, SPACING_MS);
  };
  next();
  return () => window.clearTimeout(timer);
}

/**
 * Every page in `hrefs`, and every page installed on this phone after signing
 * in (page-installer.tsx), kept ready in the app's memory the way an app keeps
 * its screens: fetched one after another once the page in front is idle, and
 * again whenever a copy grows old — all of it behind the screen. What is on
 * the screen is never fetched again by itself: a pull at the top does that
 * (pull-to-refresh.tsx).
 */
export function useWarmPages(hrefs: string[]) {
  const router = useRouter();
  const key = [...new Set(hrefs)].join("|");

  useEffect(() => {
    let live = true;
    let stop = () => {};
    const begin = window.setTimeout(() => {
      const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 300));
      idle(() => {
        const installed = readInstalled()?.pages ?? [];
        stop = warmPages(router, [...key.split("|").filter(Boolean), ...installed], () => live);
      });
    }, 600);
    return () => {
      live = false;
      window.clearTimeout(begin);
      stop();
    };
  }, [key, router]);
}
