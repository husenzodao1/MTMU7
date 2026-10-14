import type { CSSProperties } from "react";

/**
 * The opening's picture and the welcome after a sign-in (motion.css, "the
 * welcome"): one book, nothing else.
 *
 *   0.00  the shut book in the dark, the school's orange with the app's white
 *         mark on its cover — in the app, the phone's own splash has just
 *         shown the same book (res/drawable/splash_book.xml), so it is simply
 *         there; on the site it rises into view
 *   0.45  the cover swings open and the book settles in the middle
 *   0.85  three pages turn, one after another; a warm light comes up out of
 *         the pages and a few motes of it drift away
 *   1.25  the greeting writes itself under it in a light hand, left to right
 *         — "Салом, Фарангис!" after a sign-in, "Хуш омадед" on the first
 *         opening of the site
 *   1.55  under the words a small star opens in the middle, a thin swash
 *         runs out of it to either side, thinning to a hair, and ends in a
 *         curl; a last dot settles beyond each curl
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
          <svg viewBox="0 0 240 32" className="book-flourish" aria-hidden>
            {/* One half; the other is its mirror. A swash that thins from the
                middle to a hair, and a small curl where it ends. */}
            {[0, 1].map((side) => (
              <g key={side} transform={side ? "matrix(-1 0 0 1 240 0)" : undefined}>
                <path
                  className="book-swash"
                  d="M111 15.1 C 95 12.4, 77 12.9, 60 15.5 C 48 17.3, 38.5 17.2, 31 14.7 C 38.5 16.5, 48 16.6, 60 16.3 C 77 14.1, 95 13.9, 111 16.9 Z"
                />
                <path className="book-curl" pathLength={1} d="M31 14.7 C 25 12.2, 20.4 15.2, 22.6 18.1 C 24.6 20.6, 28.6 19.3, 27.9 16.6 C 27.4 14.8, 25.3 14.6, 24.8 16.1" />
                <circle className="book-dot" cx="14.5" cy="16" r="1.1" />
              </g>
            ))}
            <path className="book-star" d="M120 8.5 C 120.9 13.2, 122.6 15, 127.5 16 C 122.6 17, 120.9 18.8, 120 23.5 C 119.1 18.8, 117.4 17, 112.5 16 C 117.4 15, 119.1 13.2, 120 8.5 Z" />
          </svg>
        </div>
      )}
    </div>
  );
}
