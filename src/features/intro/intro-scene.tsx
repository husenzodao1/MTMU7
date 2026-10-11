import type { CSSProperties } from "react";
import type { ScriptLine } from "@/features/intro/greeting-paths";

/**
 * The opening's picture (the "opening" section of globals.css has its
 * timing): on the night canvas the school's mark settles in, the greeting
 * writes itself in brass — a pen tracing each letter's outline, then the ink
 * filling it — and, after a sign-in, the person's name follows; a hairline
 * draws under it all.
 *
 * Markup only, no state: the opening of every page load (intro.tsx) and the
 * welcome after signing in (welcome-transition.tsx) both draw it.
 */

/** When each line starts to be written, and how long the hand takes over it, in seconds. */
const WRITING = [
  { from: 0.15, span: 0.7 },
  { from: 0.55, span: 0.45 },
];
/** The name follows the greeting. */
const NAME_FROM = 0.7;
/** The hairline closes the writing: after the greeting, or after the name. */
const HAIRLINE_AT = { plain: 1.05, named: 1.35 };

/** Great Vibes, which writes the lines, has none of these; a name with one is written in Bad Script. */
const TAJIK_LETTERS = /[ҒғҶҷҚқӢӣӮӯҲҳ]/;

/** The school's mark as it stands in the header. */
export const SCHOOL_MARK = "МТМУ №7";

type Vars = CSSProperties & Record<`--${string}`, string | number>;

function Line({ line, index }: { line: ScriptLine; index: number }) {
  const timing = WRITING[Math.min(index, WRITING.length - 1)]!;
  return (
    <svg
      viewBox={`0 0 ${line.width} ${line.height}`}
      className={index === 0 ? "intro-script" : "intro-script intro-script-small"}
      style={{ "--units": line.width / 100, "--from": `${timing.from}s`, "--span": `${timing.span}s` } as Vars}
      aria-hidden
    >
      <g fill="currentColor" stroke="currentColor">
        {line.glyphs.map((glyph, at) => (
          <path key={at} className="intro-glyph" d={glyph.d} pathLength={1} style={{ "--at": glyph.at } as Vars} />
        ))}
      </g>
    </svg>
  );
}

export function IntroScene({ lines, name }: { lines: ScriptLine[]; name?: string }) {
  return (
    <div className="intro-writing" style={{ "--hairline-at": `${name ? HAIRLINE_AT.named : HAIRLINE_AT.plain}s` } as Vars}>
      <span className="sr-only">{[...lines.map((line) => line.text), name].filter(Boolean).join(", ")}</span>
      <span className="intro-mark" aria-hidden>
        {SCHOOL_MARK}
      </span>
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
  );
}
