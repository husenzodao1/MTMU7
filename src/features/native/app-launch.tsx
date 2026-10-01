"use client";

import { useEffect, useRef, useState } from "react";
import { splashPlugin } from "@/features/native/bridge";
import { INTRO_MS } from "@/features/native/launch-script";
import { cn } from "@/lib/utils/cn";

/**
 * What the app shows while it opens, over the page: the mark on the app's
 * night blue — the dot rises, the two leaves of the book draw out from the
 * spine — and then the mark opens towards the reader as it fades into the
 * page.
 *
 * Rendered only inside the app (the layout checks the User-Agent), and only
 * on a full page load: the server sends it with the HTML, so it covers the page
 * from the first frame until React has taken over.
 *
 * The phone shows its own splash — the same mark standing still — until the
 * page asks it to go, and the animation used to play underneath it, over and
 * done with before anybody could see it. Now it waits: LAUNCH_SCRIPT
 * (launch-script.ts), inline right after this markup, hides the phone's
 * splash the moment the page's styles are in and only then starts the
 * animation, long before React arrives. React then lets it finish, and takes
 * it away once the page is ready. A CSS fallback fades it out after four
 * seconds even if no script runs at all.
 */
export function AppLaunch() {
  const overlay = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // Normally done already by LAUNCH_SCRIPT; harmless when it was.
    void splashPlugin().then((splash) => splash?.hide({ fadeOutDuration: 150 }).catch(() => undefined));
    const started = (window as { __appLaunch?: { at?: number } }).__appLaunch?.at;
    if (overlay.current && !overlay.current.hasAttribute("data-play")) overlay.current.setAttribute("data-play", "");
    // The leaves take 0.7s to draw; the page is ready by now, so it goes as
    // soon as they have.
    const wait = typeof started === "number" ? Math.max(200, started + INTRO_MS - performance.now()) : INTRO_MS;
    const leave = window.setTimeout(() => setLeaving(true), wait);
    const remove = window.setTimeout(() => setGone(true), wait + 520);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(remove);
    };
  }, []);

  if (gone) return null;
  return (
    // data-play is set by LAUNCH_SCRIPT before React hydrates.
    <div ref={overlay} className={cn("app-launch", leaving && "app-launch-leaving")} aria-hidden suppressHydrationWarning>
      <svg viewBox="0 0 512 512" className="app-launch-mark">
        <defs>
          <linearGradient id="launch-dot" x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0" stopColor="#ffd98a" />
            <stop offset="1" stopColor="#ff9a3c" />
          </linearGradient>
        </defs>
        <circle className="app-launch-glow" cx="256" cy="190" r="92" fill="#ffb547" />
        <circle className="app-launch-dot" cx="256" cy="190" r="46" fill="url(#launch-dot)" />
        <path className="app-launch-leaf" d="M256 372 C 222 318, 164 296, 98 300" />
        <path className="app-launch-leaf" d="M256 372 C 290 318, 348 296, 414 300" />
      </svg>
    </div>
  );
}
