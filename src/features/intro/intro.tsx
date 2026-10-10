"use client";

import { useEffect, useRef, useState } from "react";
import { splashPlugin } from "@/features/native/bridge";
import { BookScene } from "@/features/intro/book-scene";
import type { ScriptLine } from "@/features/intro/greeting-paths";
import { INTRO_MS, INTRO_QUICK_MS } from "@/features/intro/intro-script";
import { cn } from "@/lib/utils/cn";

/**
 * The opening over the first page: the book, the light and the greeting
 * written by hand (book-scene.tsx) — once per visit to the site, and on each
 * start of the app.
 *
 * The server sends it with the HTML, so it covers the page from the first
 * frame, and INTRO_SCRIPT (intro-script.ts), inline right after it, starts it
 * long before React arrives: at once in a browser, and in the app the moment
 * the phone's own splash has gone. React then lets it finish and takes it
 * away. A tap ends it early; a CSS fallback reveals the page even if no
 * script runs at all.
 */
export function Intro({ lines }: { lines: ScriptLine[] }) {
  const overlay = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"on" | "out" | "gone">("on");

  useEffect(() => {
    // Normally done already by INTRO_SCRIPT; harmless when it was.
    void splashPlugin().then((splash) => splash?.hide({ fadeOutDuration: 150 }).catch(() => undefined));
    const el = overlay.current;
    if (el && !el.hasAttribute("data-play")) el.setAttribute("data-play", "");
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
    const gone = window.setTimeout(() => setPhase("gone"), 560);
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
      <BookScene lines={lines} />
    </div>
  );
}
