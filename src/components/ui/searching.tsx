"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * What a search shows while it looks: not the word "searching…" but a small
 * magnifying glass, drawn in a few thin lines, gliding in half-circles to the
 * left and the right, never twice the same way (motion.css, "searching").
 *
 * However quickly the answer comes, the glass makes its whole round — a
 * search that blinks past looks as if nothing was searched — so it shows for
 * at least MIN_MS from the moment the search is sent, longer while the answer
 * is still on its way, and the results under it wait, dimmed, until it is
 * done.
 */

const MIN_MS = 1600;

/**
 * `start` when a search is sent; `searching` is true from then for MIN_MS at
 * least, and for as long after that as `pending` (the search's own
 * transition) is.
 */
export function useSearchSweep(pending: boolean) {
  const [round, setRound] = useState(0);
  const [held, setHeld] = useState(false);
  const start = useCallback(() => {
    setRound((n) => n + 1);
    setHeld(true);
  }, []);
  useEffect(() => {
    if (round === 0) return;
    const done = window.setTimeout(() => setHeld(false), MIN_MS);
    return () => window.clearTimeout(done);
  }, [round]);
  return { searching: held || (round > 0 && pending), start, round };
}

/** Half-circles to either side, end to end; one is picked for each search. */
const PATHS = [
  "M14 30 A16 16 0 0 1 46 30 A12 12 0 0 0 70 30 A18 18 0 0 1 106 30 A14 14 0 0 0 134 30 A60 60 0 0 0 14 30",
  "M20 28 A12 12 0 0 0 44 28 A20 20 0 0 1 84 28 A10 10 0 0 0 104 28 A14 14 0 0 1 132 28 A56 56 0 0 1 20 28",
  "M16 32 A20 20 0 0 1 56 32 A10 10 0 0 0 76 32 A14 14 0 0 1 104 32 A14 14 0 0 0 132 32 A58 58 0 0 1 16 32",
];

export function SearchingPanel({ label }: { label: string }) {
  const [path] = useState(() => PATHS[Math.floor(Math.random() * PATHS.length)]!);
  return (
    <div className="searching" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="searching-field" aria-hidden>
        <div className="searching-lens" style={{ offsetPath: `path("${path}")` }}>
          <svg viewBox="0 0 24 24">
            <circle cx="10" cy="10" r="6.5" />
            <path d="M14.8 14.8 L20 20" />
          </svg>
        </div>
      </div>
    </div>
  );
}
