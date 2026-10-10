import type { CSSProperties } from "react";
import type { ScriptLine } from "@/features/intro/greeting-paths";

/**
 * The opening's picture (the "opening" section of globals.css has its
 * timing): a closed book flies in from the side, its cover opens and five
 * pages turn, it rushes at the reader into a flash of light, and on the paper
 * that light leaves behind the greeting writes itself by hand, line by line —
 * and, after a sign-in, the person's name under it.
 *
 * Markup only, no state: the opening of every page load (intro.tsx), the
 * welcome after signing in and the veil while a sign-in is checked
 * (welcome-transition.tsx) all draw it. With `closed` it is just the book,
 * shut and waiting — the veil — and nothing is written.
 */

/** When each line starts to be written, and how long the hand takes over it, in seconds. */
const WRITING = [
  { from: 2.55, span: 0.95 },
  { from: 3.25, span: 0.65 },
];
/** The name follows the last line. */
export const NAME_FROM = 3.2;

const LEAVES = [0, 1, 2, 3, 4];

/** Great Vibes, which writes the lines, has none of these; a name with one is written in Bad Script. */
const TAJIK_LETTERS = /[ҒғҶҷҚқӢӣӮӯҲҳ]/;

type Vars = CSSProperties & Record<`--${string}`, string | number>;

function Cover() {
  return (
    <svg viewBox="0 0 120 120" className="intro-emblem" aria-hidden>
      <defs>
        <radialGradient id="intro-emblem-sun" cx="0.5" cy="0.3" r="0.75">
          <stop offset="0" stopColor="#fff6d6" />
          <stop offset="0.5" stopColor="#ffc85f" />
          <stop offset="1" stopColor="#ff8733" />
        </radialGradient>
      </defs>
      <g stroke="#ffd27a" strokeWidth="3.2" strokeLinecap="round" opacity="0.9">
        {[-66, -44, -22, 0, 22, 44, 66].map((angle) => (
          <line key={angle} x1="60" y1="40" x2="60" y2={angle === 0 ? 8 : 13} transform={`rotate(${angle} 60 72)`} />
        ))}
      </g>
      <circle cx="60" cy="72" r="21" fill="url(#intro-emblem-sun)" />
      <path d="M60 110 C 48 104, 32 102, 16 104 L 16 84 C 32 82, 48 84, 60 92 C 72 84, 88 82, 104 84 L 104 104 C 88 102, 72 104, 60 110 Z" fill="#f4fbf9" />
    </svg>
  );
}

function Line({ line, index }: { line: ScriptLine; index: number }) {
  const timing = WRITING[Math.min(index, WRITING.length - 1)]!;
  const ink = `intro-ink-${index}`;
  return (
    <svg
      viewBox={`0 0 ${line.width} ${line.height}`}
      className={index === 0 ? "intro-script" : "intro-script intro-script-small"}
      style={{ "--units": line.width / 100, "--from": `${timing.from}s`, "--span": `${timing.span}s` } as Vars}
      aria-hidden
    >
      <defs>
        <linearGradient id={ink} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={line.width} y2={line.height}>
          <stop offset="0" stopColor="#2a1f6e" />
          <stop offset="0.55" stopColor="#17306d" />
          <stop offset="1" stopColor="#0b7479" />
        </linearGradient>
      </defs>
      <g fill={`url(#${ink})`} stroke={`url(#${ink})`}>
        {line.glyphs.map((glyph, at) => (
          <path key={at} className="intro-glyph" d={glyph.d} pathLength={1} style={{ "--at": glyph.at } as Vars} />
        ))}
      </g>
    </svg>
  );
}

export function BookScene({ lines = [], name, closed = false }: { lines?: ScriptLine[]; name?: string; closed?: boolean }) {
  return (
    <>
      <div className="intro-scene" aria-hidden>
        <div className="intro-fly">
          <div className="intro-rush">
            <div className="intro-book">
              <div className="intro-board" />
              <div className="intro-back" />
              {LEAVES.map((index) => (
                <div key={index} className="intro-leaf" style={{ "--i": index, "--z": LEAVES.length - index } as Vars}>
                  <div className="intro-face" />
                  <div className="intro-face intro-rear" />
                </div>
              ))}
              <div className="intro-leaf intro-cover" style={{ "--i": -2, "--z": LEAVES.length + 1 } as Vars}>
                <div className="intro-face intro-front">
                  <Cover />
                  <span className="intro-cover-title">№ 7</span>
                </div>
                <div className="intro-face intro-rear" />
              </div>
            </div>
          </div>
        </div>
        <div className="intro-light" />
      </div>
      {closed ? null : (
        <>
          <div className="intro-paper">
            <div className="intro-writing">
              <span className="sr-only">{[...lines.map((line) => line.text), name].filter(Boolean).join(", ")}</span>
              {lines.map((line, index) => (
                <Line key={line.text} line={line} index={index} />
              ))}
              {name ? (
                <p className={TAJIK_LETTERS.test(name) ? "intro-name intro-name-hand" : "intro-name"} style={{ "--from": `${NAME_FROM}s` } as Vars}>
                  {name}
                </p>
              ) : null}
              <span className="intro-hairline" aria-hidden />
            </div>
          </div>
          <div className="intro-flash" aria-hidden />
        </>
      )}
    </>
  );
}
