import type { CSSProperties } from "react";

/**
 * The opening's picture and the welcome after a sign-in (motion.css, "the
 * welcome"): one book, nothing else.
 *
 *   0.00  the shut book rises into the light, the school's orange with its
 *         white mark on the cover
 *   0.45  the cover swings open and the book settles in the middle
 *   0.85  three pages turn, one after another; a warm light comes up out of
 *         the pages and a few motes of it drift away
 *   1.25  the greeting writes itself under it in a light hand, left to right
 *         — "Салом, Фарангис!" after a sign-in, "Хуш омадед" on the first
 *         opening of the site
 *   1.60  a thin ornament draws itself under the words from both ends at
 *         once, and they meet at a small diamond in the middle
 *
 * Markup only, no state: the first opening (intro.tsx), the welcome and the
 * wait while a sign-in is checked (welcome-transition.tsx) all draw it.
 * Waiting, the book stays shut and floats, breathing a little light.
 *
 * Every movement is a transform or an opacity; until the overlay is told to
 * play (data-play) everything stands at its first frame.
 */

type Vars = CSSProperties & Record<`--${string}`, string | number>;

const LEAVES = [0, 1, 2];
const MOTES = [
  { x: -46, d: 0 },
  { x: 38, d: 0.25 },
  { x: -14, d: 0.5 },
  { x: 58, d: 0.7 },
  { x: -64, d: 0.9 },
];

/** The school's mark from the app icon: a dot over an open book. */
function Mark() {
  return (
    <svg viewBox="0 0 512 512" className="book-mark" aria-hidden>
      <circle cx="256" cy="164" r="52" />
      <path d="M256 362 C 230 312, 178 282, 110 270 M256 362 C 282 312, 334 282, 402 270" />
    </svg>
  );
}

export function BookScene({ hello, name, waiting = false }: { hello: string; name?: string; waiting?: boolean }) {
  return (
    <div className="book-stage" data-waiting={waiting || undefined}>
      <div className="book-scene" aria-hidden>
        <div className="book-glow" />
        <div className="book">
          <div className="book-block" />
          {LEAVES.map((index) => (
            <div key={index} className="book-leaf" style={{ "--i": index, "--from": 6 - index, "--to": 6 + index } as Vars} />
          ))}
          <div className="book-cover">
            <div className="book-cover-front">
              <Mark />
              <span className="book-number">№ 7</span>
            </div>
            <div className="book-cover-inside" />
          </div>
        </div>
        <div className="book-motes">
          {MOTES.map((mote, index) => (
            <i key={index} style={{ "--x": `${mote.x}px`, "--d": `${mote.d}s` } as Vars} />
          ))}
        </div>
      </div>
      {waiting ? null : (
        <div className="book-words">
          <p className="book-hello" aria-label={name ? `${hello}, ${name}!` : hello}>
            <span aria-hidden>
              {name ? `${hello}, ` : hello}
              {name ? <span className="book-name">{name}!</span> : null}
            </span>
          </p>
          <svg viewBox="0 0 240 28" className="book-flourish" aria-hidden>
            <path pathLength={1} d="M4 14 C 10 7, 19 7, 24 13 C 28 18, 34 19, 39 15 C 52 6, 76 7, 94 12 C 101 14, 106 14, 111 14" />
            <path pathLength={1} d="M236 14 C 230 7, 221 7, 216 13 C 212 18, 206 19, 201 15 C 188 6, 164 7, 146 12 C 139 14, 134 14, 129 14" />
            <path className="book-flourish-gem" d="M120 9 L125 14 L120 19 L115 14 Z" />
          </svg>
        </div>
      )}
    </div>
  );
}
