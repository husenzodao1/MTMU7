"use client";

import { useEffect, useRef, useState } from "react";

/**
 * What a search shows while it looks: not the word "searching…" but a
 * magnifying glass that sweeps over a few faint pages, in half-circles to the
 * left and the right, never twice the same way (motion.css, "searching").
 *
 * However quickly the answer comes, the glass is given its moment — a search
 * that blinks past looks as if nothing was searched — so it stays at least
 * MIN_MS (useLingering), and the results under it wait, dimmed, until it is
 * done.
 */

const MIN_MS = 2200;

/** True while `active`, and for at least `minMs` from the moment it became so. */
export function useLingering(active: boolean, minMs = MIN_MS) {
  const [lingering, setLingering] = useState(false);
  const startedAt = useRef(0);
  useEffect(() => {
    if (active) {
      startedAt.current = performance.now();
      // Not cancelled when `active` ends at once: a search answered in a
      // blink still shows the glass for its moment.
      window.setTimeout(() => setLingering(true), 0);
      return;
    }
    const left = minMs - (performance.now() - startedAt.current);
    const off = window.setTimeout(() => setLingering(false), Math.max(0, left));
    return () => window.clearTimeout(off);
  }, [active, minMs]);
  return active || lingering;
}

/** Half-circles to either side, end to end; one is picked for each search. */
const PATHS = [
  "M24 48 A22 22 0 0 1 68 48 A16 16 0 0 0 100 48 A26 26 0 0 1 152 48 A20 20 0 0 0 112 48 A22 22 0 0 1 68 48 A22 22 0 0 0 24 48",
  "M30 46 A18 18 0 0 0 66 46 A28 28 0 0 1 122 46 A14 14 0 0 0 150 46 A24 24 0 0 1 102 46 A18 18 0 0 0 66 46 A18 18 0 0 1 30 46",
  "M20 50 A30 30 0 0 1 80 50 A12 12 0 0 0 104 50 A22 22 0 0 1 148 50 A30 30 0 0 0 88 50 A16 16 0 0 1 56 50 A18 18 0 0 0 20 50",
];

export function SearchingPanel({ label }: { label: string }) {
  const [path] = useState(() => PATHS[Math.floor(Math.random() * PATHS.length)]!);
  return (
    <div className="searching" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="searching-field" aria-hidden>
        <svg viewBox="0 0 176 96" className="searching-pages">
          {[
            { x: 14, y: 16 },
            { x: 62, y: 30 },
            { x: 108, y: 14 },
            { x: 140, y: 40 },
          ].map((page, index) => (
            <g key={index} className="searching-page" transform={`translate(${page.x} ${page.y})`} style={{ animationDelay: `${index * 0.35}s` }}>
              <rect width="24" height="30" rx="3" />
              <path d="M5 8h14M5 13h14M5 18h9" />
            </g>
          ))}
        </svg>
        <div className="searching-lens" style={{ offsetPath: `path("${path}")` }}>
          <svg viewBox="0 0 40 40">
            <circle cx="16" cy="16" r="11" className="searching-glass" />
            <path d="M12 11.5a6 6 0 0 1 6-2.5" className="searching-shine" />
            <path d="M24.5 24.5 L34 34" className="searching-handle" />
          </svg>
        </div>
      </div>
    </div>
  );
}
