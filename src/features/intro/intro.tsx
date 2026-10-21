"use client";

import { useEffect, useRef, useState } from "react";
import { splashPlugin } from "@/features/native/bridge";
import { BookScene } from "@/features/intro/book-scene";
import { INTRO_GAP_MS, INTRO_MS, INTRO_QUICK_MS, INTRO_SEEN } from "@/features/intro/intro-script";
import { WELCOME_COOKIE } from "@/lib/auth/welcome-cookie";
import { cn } from "@/lib/utils/cn";

/**
 * The opening over the first page: the book opens, a light comes up out of
 * it and "Хуш омадед" writes itself under it (book-scene.tsx) — once per
 * visit to the site and when the app is opened, at most once in half an
 * hour (intro-script.ts).
 *
 * The server sends it with the HTML, so it covers the page from the first
 * frame, and INTRO_SCRIPT (intro-script.ts), inline right after it, starts it
 * long before React arrives: at once in a browser, and in the app the moment
 * the phone's own splash has gone. React then lets it finish and takes it
 * away. A tap ends it early; a CSS fallback reveals the page even if no
 * script runs at all.
 */
export function Intro({ words }: { words: string }) {
  const overlay = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"on" | "out" | "gone">("on");

  useEffect(() => {
    // Normally done already by INTRO_SCRIPT; harmless when it was.
    void splashPlugin().then((splash) => splash?.hide({ fadeOutDuration: 150 }).catch(() => undefined));
    const el = overlay.current;
    // Drawn by React rather than arriving with the page (INTRO_SCRIPT marks
    // every opening it sees): the opening of a visit already under way, which
    // never plays — only one that has not played yet in this tab, should the
    // inline script not have run at all.
    if (el && !el.hasAttribute("data-play")) {
      let seen = false;
      try {
        const now = Date.now();
        seen =
          sessionStorage.getItem(INTRO_SEEN) === "1" ||
          document.cookie.includes(`${WELCOME_COOKIE}=1`) ||
          now - (Number(localStorage.getItem(INTRO_SEEN)) || 0) < INTRO_GAP_MS;
        sessionStorage.setItem(INTRO_SEEN, "1");
        if (!seen) localStorage.setItem(INTRO_SEEN, String(now));
      } catch {
        // No storage: played, as the script would have.
      }
      if (seen) el.setAttribute("data-skip", "");
      el.setAttribute("data-play", "");
    }
    // Already played since the app started: it was never shown.
    if (el?.hasAttribute("data-skip")) {
      const gone = window.setTimeout(() => setPhase("gone"), 0);
      return () => window.clearTimeout(gone);
    }
    const length = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? INTRO_QUICK_MS : INTRO_MS;
    const started = (window as { __appLaunch?: { at?: number } }).__appLaunch?.at;
    const wait = typeof started === "number" ? Math.max(200, started + length - performance.now()) : length;
    const out = window.setTimeout(() => setPhase("out"), wait);
    return () => window.clearTimeout(out);
  }, []);

  useEffect(() => {
    if (phase !== "out") return;
    const gone = window.setTimeout(() => setPhase("gone"), 480);
    return () => window.clearTimeout(gone);
  }, [phase]);

  if (phase === "gone") return null;
  return (
    // data-play and data-skip are set by INTRO_SCRIPT before React hydrates.
    <div
      id="intro"
      ref={overlay}
      className={cn("intro", phase === "out" && "intro-leaving")}
      aria-hidden
      suppressHydrationWarning
      onClick={() => setPhase("out")}
    >
      <BookScene hello={words} />
    </div>
  );
}
