import type { CSSProperties } from "react";

/**
 * The welcome's picture (motion.css, "the welcome"): a pupil in a graduation
 * cap, holding a shut book against their chest.
 *
 *   0.00  they pop up, a little bounce
 *   0.30  they look to the left, then to the right, as if waiting for somebody
 *   0.90  and see you: the eyes go round, the eyebrows jump, a "!" over the cap
 *   1.05  they lift the book towards you and open it — the cover swings away
 *   1.30  a sun climbs out of the pages and rises behind them, its rays
 *         turning, sparks flying off the book
 *   1.45  two pages turn over, one after the other
 *   1.70  they lean in closer with the book, smiling with an open mouth, and
 *         "Салом, Фарангис!" appears under them letter by letter
 *   2.30  a blink
 *
 * Markup only, no state: the first opening of the site (intro.tsx), the
 * welcome after signing in and the wait while a sign-in is checked
 * (welcome-transition.tsx) all draw it. Waiting, they only hold the shut book
 * and look about, over and over.
 *
 * Every movement is a transform or an opacity of a part of the drawing; until
 * the overlay is told to play (data-play) it stands at its first frame.
 */

type Vars = CSSProperties & Record<`--${string}`, string | number>;

/** When the letters start to appear, and how far apart, in seconds. */
const LETTERS_FROM = 1.72;
const LETTER_STEP = 0.03;

function Letters({ text, from = 0 }: { text: string; from?: number }) {
  return (
    <>
      {Array.from(text).map((char, index) => (
        <span key={index} className="mascot-letter" style={{ "--at": `${LETTERS_FROM + (from + index) * LETTER_STEP}s` } as Vars}>
          {char === " " ? " " : char}
        </span>
      ))}
    </>
  );
}

const SPARKS = [
  { x: -44, y: -40, r: -20 },
  { x: 46, y: -46, r: 25 },
  { x: -62, y: -6, r: -40 },
  { x: 64, y: -4, r: 40 },
  { x: -24, y: -64, r: -8 },
  { x: 26, y: -66, r: 10 },
];

export function MascotScene({ hello, name, waiting = false }: { hello: string; name?: string; waiting?: boolean }) {
  return (
    <div className="mascot-stage" data-waiting={waiting || undefined}>
      <div className="mascot-wall" aria-hidden />
      <div className="mascot-figure">
        <svg viewBox="0 0 240 290" className="mascot" aria-hidden>
          <defs>
            <radialGradient id="mascot-sun" cx="0.42" cy="0.38" r="0.7">
              <stop offset="0" stopColor="#fff7d8" />
              <stop offset="0.55" stopColor="#ffcf55" />
              <stop offset="1" stopColor="#ff9a3c" />
            </radialGradient>
            <radialGradient id="mascot-glow">
              <stop offset="0" stopColor="#ffd77a" stopOpacity="0.9" />
              <stop offset="1" stopColor="#ffd77a" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="mascot-coat" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3561b8" />
              <stop offset="1" stopColor="#24468f" />
            </linearGradient>
          </defs>

          {/* The sun that climbs out of the book and rises behind them. */}
          <g className="mascot-sunrise">
            <circle cx="120" cy="80" r="104" fill="url(#mascot-glow)" className="mascot-sun-glow" />
            <g className="mascot-sun-rays" stroke="#ffd77a" strokeWidth="5" strokeLinecap="round" opacity="0.85">
              {Array.from({ length: 16 }, (_, i) => i * 22.5).map((angle) => (
                <line key={angle} x1="120" y1="2" x2="120" y2="-14" transform={`rotate(${angle} 120 80)`} />
              ))}
            </g>
            <circle cx="120" cy="80" r="66" fill="url(#mascot-sun)" />
          </g>

          <ellipse className="mascot-shadow" cx="120" cy="276" rx="58" ry="8" />

          <g className="mascot-body">
            {/* Legs and shoes. */}
            <rect x="97" y="234" width="17" height="34" rx="8" fill="#1d2f5e" />
            <rect x="126" y="234" width="17" height="34" rx="8" fill="#1d2f5e" />
            <ellipse cx="103" cy="270" rx="13" ry="6" fill="#2a1d18" />
            <ellipse cx="137" cy="270" rx="13" ry="6" fill="#2a1d18" />

            {/* The coat, its collar and the school's gold tie. */}
            <path d="M72 240 Q68 192 88 164 Q120 148 152 164 Q172 192 168 240 Q120 252 72 240 Z" fill="url(#mascot-coat)" />
            <rect x="111" y="140" width="18" height="18" rx="6" fill="#efbd96" />
            <path d="M103 156 L120 172 L111 179 Z" fill="#fff" />
            <path d="M137 156 L120 172 L129 179 Z" fill="#fff" />
            <path d="M117 172 L123 172 L126 192 L120 199 L114 192 Z" fill="#e3a130" />

            <g className="mascot-head">
              {/* Ears, face, cheeks. */}
              <circle cx="71" cy="106" r="9" fill="#eab089" stroke="#c98a66" strokeWidth="1.6" />
              <circle cx="169" cy="106" r="9" fill="#eab089" stroke="#c98a66" strokeWidth="1.6" />
              <circle cx="120" cy="102" r="50" fill="#f4c7a1" stroke="#c98a66" strokeWidth="1.8" />
              <circle cx="88" cy="123" r="7.5" fill="#f19a8c" opacity="0.55" />
              <circle cx="152" cy="123" r="7.5" fill="#f19a8c" opacity="0.55" />

              {/* Hair, under the cap. */}
              <path d="M72 98 Q68 62 104 54 Q140 46 162 70 Q170 80 168 98 Q160 80 146 76 Q136 86 118 79 Q100 88 86 82 Q78 88 72 98 Z" fill="#3b2a20" />

              {/* The eyes: whites, pupils that look about, lids that blink. */}
              <g className="mascot-eyes">
                <ellipse cx="100" cy="106" rx="11" ry="12.5" fill="#fff" />
                <ellipse cx="140" cy="106" rx="11" ry="12.5" fill="#fff" />
                <g className="mascot-pupils">
                  <circle cx="100" cy="107" r="6.2" fill="#2b1d16" />
                  <circle cx="140" cy="107" r="6.2" fill="#2b1d16" />
                  <circle cx="102.4" cy="104.4" r="2" fill="#fff" />
                  <circle cx="142.4" cy="104.4" r="2" fill="#fff" />
                </g>
                <rect className="mascot-lid" x="87" y="92" width="26" height="27" rx="11" fill="#f4c7a1" />
                <rect className="mascot-lid" x="127" y="92" width="26" height="27" rx="11" fill="#f4c7a1" />
              </g>
              <g className="mascot-brows" fill="none" stroke="#3b2a20" strokeWidth="3.2" strokeLinecap="round">
                <path d="M89 88 Q100 82 111 88" />
                <path d="M129 88 Q140 82 151 88" />
              </g>
              <path d="M117 116 Q120 119 123 116" fill="none" stroke="#d99c76" strokeWidth="2.2" strokeLinecap="round" />
              <path className="mascot-smile" d="M108 127 Q120 137 132 127" fill="none" stroke="#7a3b2e" strokeWidth="3" strokeLinecap="round" />
              <g className="mascot-laugh">
                <path d="M106 125 Q120 147 134 125 Q120 131 106 125 Z" fill="#7a3b2e" />
                <path d="M113 136 Q120 132 127 136 Q120 142 113 136 Z" fill="#ef7f74" />
              </g>

              {/* The cap: board, crown, button, and a tassel that swings. */}
              <path d="M92 56 L92 71 Q120 84 148 71 L148 56 Z" fill="#26386a" />
              <path d="M120 30 L178 49 L120 68 L62 49 Z" fill="#1c2950" />
              <path d="M120 33 L170 49 L120 65" fill="none" stroke="#2f4380" strokeWidth="1.5" />
              <g className="mascot-tassel">
                <path d="M120 49 L166 53 L167 78" fill="none" stroke="#f5c542" strokeWidth="2" strokeLinecap="round" />
                <path d="M163 76 L171 76 L172 88 L162 88 Z" fill="#f5c542" />
              </g>
              <circle cx="120" cy="49" r="3.2" fill="#f5c542" />
            </g>

            {/* "!" — they have seen you. */}
            <g className="mascot-spark">
              <path d="M200 26 L196 52" stroke="#ffd25a" strokeWidth="6" strokeLinecap="round" />
              <circle cx="194.4" cy="64" r="3.6" fill="#ffd25a" />
            </g>
          </g>

          {/* The book, in both hands. */}
          <g className="mascot-book">
            <g className="mascot-sparks">
              {SPARKS.map((spark, index) => (
                <path
                  key={index}
                  className="mascot-sparkle"
                  d="M0 -5 L1.3 -1.3 L5 0 L1.3 1.3 L0 5 L-1.3 1.3 L-5 0 L-1.3 -1.3 Z"
                  fill={index % 2 ? "#ffd25a" : "#ffffff"}
                  style={{ "--x": `${spark.x}px`, "--y": `${spark.y}px`, "--r": `${spark.r}deg` } as Vars}
                />
              ))}
            </g>
            {/* Inside: the left page (the cover's back), the right page and its lines. */}
            <g className="mascot-inside">
              <path d="M-64 -20 Q-34 -26 0 -20 L0 22 Q-34 16 -64 22 Z" fill="#fffaf0" />
              <g stroke="#d8cdb6" strokeWidth="1.6" strokeLinecap="round">
                <path d="M-54 -8 H-12" />
                <path d="M-54 0 H-12" />
                <path d="M-54 8 H-24" />
              </g>
            </g>
            <path d="M0 -20 Q32 -26 64 -20 L64 22 Q32 16 0 22 Z" fill="#fffdf6" />
            <g stroke="#d8cdb6" strokeWidth="1.6" strokeLinecap="round">
              <path d="M10 -8 H54" />
              <path d="M10 0 H54" />
              <path d="M10 8 H40" />
            </g>
            <path className="mascot-leaf mascot-leaf-1" d="M0 -20 Q32 -26 64 -20 L64 22 Q32 16 0 22 Z" fill="#fff4dc" />
            <path className="mascot-leaf mascot-leaf-2" d="M0 -20 Q32 -26 64 -20 L64 22 Q32 16 0 22 Z" fill="#fff8e8" />
            {/* The cover, shut over the right page; it swings to the left. */}
            <g className="mascot-cover">
              <rect x="0" y="-22" width="64" height="44" rx="4" fill="#c2462f" />
              <rect x="0" y="-22" width="8" height="44" rx="3" fill="#9c3424" />
              <rect x="18" y="-9" width="34" height="9" rx="2" fill="#f5c542" />
              <rect x="22" y="5" width="26" height="3" rx="1.5" fill="#f2b2a6" />
            </g>
            {/* The hands that hold it. */}
            <circle className="mascot-hand" cx="-2" cy="12" r="8" fill="#f4c7a1" />
            <circle className="mascot-hand mascot-hand-right" cx="66" cy="12" r="8" fill="#f4c7a1" />
          </g>
        </svg>
      </div>
      {waiting ? null : (
        <p className="mascot-hello" aria-label={name ? `${hello}, ${name}!` : `${hello}!`}>
          <span aria-hidden>
            <Letters text={`${hello}${name ? "," : "!"}`} />
          </span>
          {name ? (
            <span aria-hidden className="mascot-name">
              <Letters text={` ${name}!`} from={hello.length + 1} />
            </span>
          ) : null}
        </p>
      )}
    </div>
  );
}
