"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { pageLink } from "@/components/shell/instant-nav";
import { warmPage, warmedRecently } from "@/components/shell/warm-pages";

/** Between one link's page fetched ahead and the next: most come from the device, a few from a slow line. */
const SPACING_MS = 80;
/** A link this close to the screen is about to be on it. */
const MARGIN = "240px";
/** The page's links are looked at again this long after it last changed. */
const SETTLE_MS = 300;
/**
 * On the website, where a page fetched ahead is the server's work rather than
 * the device's, only this many of a page's links are: the first ones in view.
 */
const WEBSITE_MOST = 12;

/**
 * Every link on the screen has its page ready before it is tapped, the way an
 * app's list opens its rows at once: each conversation, account, class,
 * article or book that scrolls into view is fetched ahead, whole — from the
 * device when it is kept there (public/sw.js), which is at once — so the tap
 * opens it from the app's memory, with or without a line. Links further down
 * wait until they come into view.
 */
export function useWarmVisibleLinks(pathname: string) {
  const router = useRouter();
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    let live = true;
    const queue: string[] = [];
    let pumping = 0;
    let left = document.documentElement.hasAttribute("data-app") ? Infinity : WEBSITE_MOST;
    const pump = () => {
      pumping = 0;
      const href = queue.shift();
      if (!live || !href || left <= 0) return;
      if (!warmedRecently(href)) {
        left -= 1;
        warmPage(router, href, () => live);
      }
      if (queue.length > 0) pumping = window.setTimeout(pump, SPACING_MS);
    };
    const seen = new WeakSet<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          const url = pageLink(entry.target);
          if (!url || url.pathname === window.location.pathname) continue;
          const href = `${url.pathname}${url.search}`;
          if (!queue.includes(href)) queue.push(href);
        }
        if (queue.length > 0 && !pumping) pumping = window.setTimeout(pump, 0);
      },
      { rootMargin: MARGIN }
    );
    const watch = () => {
      for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]'))) {
        if (seen.has(anchor)) continue;
        seen.add(anchor);
        observer.observe(anchor);
      }
    };
    let settling = 0;
    const changed = new MutationObserver(() => {
      window.clearTimeout(settling);
      settling = window.setTimeout(watch, SETTLE_MS);
    });
    // After the page in front has had its moment.
    const begin = window.setTimeout(() => {
      watch();
      changed.observe(document.body, { childList: true, subtree: true });
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(begin);
      window.clearTimeout(settling);
      window.clearTimeout(pumping);
      changed.disconnect();
      observer.disconnect();
    };
  }, [pathname, router]);
}
