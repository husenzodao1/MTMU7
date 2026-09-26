"use client";

import { useEffect, useState } from "react";
import { splashPlugin } from "@/features/native/bridge";
import { cn } from "@/lib/utils/cn";

/**
 * What the app shows while it opens, over the page: the mark on the app's
 * night blue — the dot rises, the two leaves of the book draw out from the
 * spine — and then it fades into the page.
 *
 * Rendered only inside the app (the layout checks the User-Agent), and only
 * on a full page load: the server sends it with the HTML, so it covers the page
 * from the first frame until React has taken over, then gets out of the way.
 * The phone's own splash is the same picture standing still, so the hand-over
 * from native to web is invisible. A CSS fallback fades it out after four
 * seconds even if JavaScript never runs.
 */
export function AppLaunch() {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    void splashPlugin().then((splash) => splash?.hide({ fadeOutDuration: 150 }).catch(() => undefined));
    // Long enough for the leaves to finish drawing, no longer.
    const leave = window.setTimeout(() => setLeaving(true), 700);
    const remove = window.setTimeout(() => setGone(true), 1150);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(remove);
    };
  }, []);

  if (gone) return null;
  return (
    <div className={cn("app-launch", leaving && "app-launch-leaving")} aria-hidden>
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
