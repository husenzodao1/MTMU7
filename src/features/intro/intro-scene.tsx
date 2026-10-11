import type { CSSProperties } from "react";

/**
 * The opening's picture (the "opening" section of globals.css has its
 * timing): on the night canvas the school's mark settles in, a greeting is
 * written out in the serif, left to right, as a pen would, and — after a
 * sign-in — the person's name follows in brass; a hairline closes it.
 *
 * Markup only, no state: the opening of a first visit (intro.tsx) and the
 * welcome after signing in (welcome-transition.tsx) both draw it.
 */

/** When the name starts, and when the hairline closes the writing, in seconds. */
const NAME_FROM = 0.55;
const HAIRLINE_AT = { plain: 0.95, named: 1.3 };

/** The school's mark as it stands in the header. */
export const SCHOOL_MARK = "МТМУ №7";

type Vars = CSSProperties & Record<`--${string}`, string | number>;

export function IntroScene({ words, name }: { words: string; name?: string }) {
  return (
    <div className="intro-writing" style={{ "--hairline-at": `${name ? HAIRLINE_AT.named : HAIRLINE_AT.plain}s` } as Vars}>
      <span className="intro-mark" aria-hidden>
        {SCHOOL_MARK}
      </span>
      <p className="intro-words">{name ? `${words},` : words}</p>
      {name ? (
        <p className="intro-name" style={{ "--from": `${NAME_FROM}s` } as Vars}>
          {name}
        </p>
      ) : null}
      <span className="intro-hairline" aria-hidden />
    </div>
  );
}
