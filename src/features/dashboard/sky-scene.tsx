import { useId, type CSSProperties } from "react";
import type { DayPart } from "@/lib/i18n/format";
import type { WeatherKind } from "@/features/dashboard/weather-kind";

/**
 * The little world behind the greeting (greeting-card.tsx): the hour draws it
 * and the weather in Istaravshan dresses it.
 *
 *   morning  the sun climbs out from behind the hills, and a breeze runs
 *            through the grass in front of them
 *   day      the sun high, its rays turning slowly, a bird or two
 *   evening  a low red sun going down behind the hills, birds flying home,
 *            the first stars
 *   night    a crescent moon breathing light, three layers of stars that
 *            fade and come back each at its own pace, now and then a falling
 *            star
 *
 * Over that: clouds that drift across (more and greyer as the sky closes),
 * rain in two depths, snow in two depths swaying as it falls, fog banks
 * rolling, lightning in a storm — and when the wind is strong the grass leans
 * further and streaks of wind cross the card.
 *
 * Markup only: every movement is CSS (motion.css, "the sky"), transforms and
 * opacity, paused while the card is off screen and drawn still for whoever
 * asks for less motion. Nothing in it is read out.
 */

type Vars = CSSProperties & Record<`--${string}`, string | number>;

/** A fixed sequence of "random" numbers, so server and browser draw the same sky. */
function sequence(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const STARS = (() => {
  const next = sequence(7);
  return Array.from({ length: 30 }, (_, i) => ({
    x: Math.round(next() * 400 * 10) / 10,
    y: Math.round(next() * 150 * 10) / 10,
    r: Math.round((0.55 + next() * 1.05) * 100) / 100,
    layer: (i % 3) + 1,
    delay: Math.round(next() * 6000) / 1000,
  }));
})();

/** The hills' tops, as functions of x, so the grass can stand on them. */
const backHill = (x: number) => 154 + 0.0016 * (x - 292) ** 2;
const frontHill = (x: number) => 175 + 0.0011 * (x - 330) ** 2;

function hillPath(top: (x: number) => number, from: number) {
  const points: string[] = [];
  for (let x = from; x <= 400; x += 10) points.push(`${x} ${Math.round(top(x) * 10) / 10}`);
  return `M${from} 200 L${points.join(" L")} L400 200 Z`;
}
const BACK_HILL = hillPath(backHill, 100);
const FRONT_HILL = hillPath(frontHill, 150);

const BLADES = (() => {
  const next = sequence(11);
  const blades: Array<{ x: number; y: number; d: string; dur: number; delay: number }> = [];
  for (let x = 172; x <= 399; x += 6 + Math.round(next() * 5)) {
    const height = 8 + next() * 10;
    const lean = -2 + next() * 4;
    blades.push({
      x,
      y: Math.round((frontHill(x) + 1.5) * 10) / 10,
      d: `M0 0 Q${(lean * 0.4).toFixed(1)} ${(-height / 2).toFixed(1)} ${lean.toFixed(1)} ${(-height).toFixed(1)}`,
      dur: Math.round((2.1 + next() * 1.4) * 100) / 100,
      delay: -Math.round(next() * 3000) / 1000,
    });
  }
  return blades;
})();

/** A few tulips among the grass — Istaravshan's hills in spring. */
const TULIPS = (() => {
  const next = sequence(23);
  return [196, 238, 262, 301, 334, 362, 388].map((x) => ({
    x,
    y: Math.round((frontHill(x) + 1) * 10) / 10,
    height: Math.round((10 + next() * 6) * 10) / 10,
    dur: Math.round((2.3 + next() * 1.2) * 100) / 100,
    delay: -Math.round(next() * 3000) / 1000,
    tone: next() > 0.7 ? "sky-tulip-gold" : "sky-tulip-red",
  }));
})();

const RAYS = Array.from({ length: 12 }, (_, i) => i * 30);

/** How many clouds each sky has, and where they float. */
const CLOUDS: Record<WeatherKind, number> = { clear: 1, partly: 2, cloudy: 4, fog: 2, drizzle: 3, rain: 4, snow: 3, storm: 4 };
const CLOUD_PLACES = [
  { top: "8%", scale: 1, dur: 64, delay: -18 },
  { top: "30%", scale: 0.7, dur: 82, delay: -55 },
  { top: "2%", scale: 0.85, dur: 74, delay: -40 },
  { top: "44%", scale: 0.6, dur: 96, delay: -8 },
];

type Ids = Record<"glow" | "disc" | "ray" | "halo" | "crescent" | "falling", string>;

function Sun({ ids }: { ids: Ids }) {
  return (
    <g className="sky-sun">
      <circle className="sky-sun-glow" cx="0" cy="0" r="46" fill={`url(#${ids.glow})`} />
      <g className="sky-sun-rays" stroke={`url(#${ids.ray})`} strokeWidth="2.2" strokeLinecap="round">
        {RAYS.map((angle) => (
          <line key={angle} x1="0" y1="-27" x2="0" y2="-37" transform={`rotate(${angle})`} />
        ))}
      </g>
      <circle className="sky-sun-disc" cx="0" cy="0" r="20" fill={`url(#${ids.disc})`} />
    </g>
  );
}

function Moon({ ids }: { ids: Ids }) {
  return (
    <g className="sky-moon">
      <circle className="sky-moon-halo" cx="0" cy="0" r="34" fill={`url(#${ids.halo})`} />
      <circle cx="0" cy="0" r="15" fill="#f6efd9" mask={`url(#${ids.crescent})`} />
      <circle cx="-5" cy="3" r="1.6" fill="#e2d8bc" mask={`url(#${ids.crescent})`} />
      <circle cx="-8" cy="-4" r="1.1" fill="#e2d8bc" mask={`url(#${ids.crescent})`} />
    </g>
  );
}

function Birds() {
  return (
    <g className="sky-birds" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      {[
        { x: 0, y: 0, s: 1 },
        { x: 13, y: 6, s: 0.8 },
        { x: -11, y: 9, s: 0.7 },
      ].map((bird, i) => (
        <g key={i} transform={`translate(${bird.x} ${bird.y}) scale(${bird.s})`}>
          <path className="sky-bird" style={{ animationDelay: `${-i * 0.18}s` }} d="M-6 0 Q-3 -3.5 0 0 Q3 -3.5 6 0" />
        </g>
      ))}
    </g>
  );
}

export function SkyScene({ part, weather, windy = false }: { part: DayPart; weather: WeatherKind | null; windy?: boolean }) {
  const kind = weather ?? "clear";
  const wet = kind === "rain" || kind === "drizzle" || kind === "storm";
  const starry = part === "night" || part === "evening";
  const breeze = part === "morning" || windy;
  const birds = (part === "day" || part === "evening") && (kind === "clear" || kind === "partly") && !windy;
  // Gradients are found by id: each sky its own, should a page draw two.
  const base = `sky${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const ids: Ids = { glow: `${base}-glow`, disc: `${base}-disc`, ray: `${base}-ray`, halo: `${base}-halo`, crescent: `${base}-crescent`, falling: `${base}-falling` };

  return (
    <div className="sky" data-part={part} data-weather={kind} data-windy={windy || undefined} aria-hidden>
      {starry ? (
        <svg className="sky-stars" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
          {STARS.map((star, i) => (
            <circle key={i} className={`sky-star sky-star-${star.layer}`} cx={star.x} cy={star.y} r={star.r} style={{ animationDelay: `${-star.delay}s` }} />
          ))}
          {part === "night" ? <line className="sky-falling" x1="0" y1="0" x2="34" y2="0" stroke={`url(#${ids.falling})`} strokeWidth="1.4" strokeLinecap="round" /> : null}
        </svg>
      ) : null}

      <svg className="sky-land" viewBox="0 0 400 200" preserveAspectRatio="xMaxYMax meet">
        <defs>
          <radialGradient id={ids.glow}>
            <stop offset="0" style={{ stopColor: "var(--sky-sun-glow)" }} stopOpacity="0.85" />
            <stop offset="1" style={{ stopColor: "var(--sky-sun-glow)" }} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={ids.disc} cx="0.4" cy="0.35" r="0.7">
            <stop offset="0" stopColor="#fff7dc" />
            <stop offset="0.55" style={{ stopColor: "var(--sky-sun-mid)" }} />
            <stop offset="1" style={{ stopColor: "var(--sky-sun-edge)" }} />
          </radialGradient>
          <linearGradient id={ids.ray} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe6a3" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ffe6a3" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={ids.halo}>
            <stop offset="0.35" stopColor="#fff4cf" stopOpacity="0.35" />
            <stop offset="1" stopColor="#fff4cf" stopOpacity="0" />
          </radialGradient>
          <mask id={ids.crescent}>
            <rect x="-40" y="-40" width="80" height="80" fill="#fff" />
            <circle cx="7" cy="-5" r="13" fill="#000" />
          </mask>
          <linearGradient id={ids.falling} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.95" />
          </linearGradient>
        </defs>

        <g transform={part === "night" ? "translate(342 48)" : part === "day" ? "translate(344 54)" : part === "evening" ? "translate(308 170)" : "translate(330 160)"}>
          {part === "night" ? <Moon ids={ids} /> : <Sun ids={ids} />}
        </g>

        {birds ? (
          <g className="sky-flock" transform="translate(250 64)">
            <Birds />
          </g>
        ) : null}

        <path className="sky-hill-back" d={BACK_HILL} />
        <path className="sky-hill-front" d={FRONT_HILL} />
        <g className="sky-grass" strokeLinecap="round" fill="none">
          {BLADES.map((blade, i) => (
            <g key={i} transform={`translate(${blade.x} ${blade.y})`}>
              <path className="sky-blade" d={blade.d} style={{ "--sway": `${blade.dur}s`, animationDelay: `${blade.delay}s` } as Vars} />
            </g>
          ))}
          {part === "night"
            ? null
            : TULIPS.map((tulip, i) => (
                <g key={`t${i}`} transform={`translate(${tulip.x} ${tulip.y})`}>
                  <g className="sky-blade sky-tulip" style={{ "--sway": `${tulip.dur}s`, animationDelay: `${tulip.delay}s` } as Vars}>
                    <path className="sky-tulip-stem" d={`M0 0 Q0.8 ${-tulip.height / 2} 0 ${-tulip.height}`} />
                    <path
                      className={tulip.tone}
                      d={`M-2.6 ${-tulip.height} Q-3.1 ${-tulip.height - 4.6} -1.5 ${-tulip.height - 5.6} L0 ${-tulip.height - 3.8} L1.5 ${-tulip.height - 5.6} Q3.1 ${-tulip.height - 4.6} 2.6 ${-tulip.height} Q0 ${-tulip.height + 1.6} -2.6 ${-tulip.height} Z`}
                    />
                  </g>
                </g>
              ))}
        </g>

        {breeze ? (
          <g className="sky-wind" fill="none" strokeLinecap="round">
            <path d="M150 120 c 14 -5 28 -5 42 0 s 28 5 42 0" style={{ animationDelay: "0s" }} />
            <path d="M210 92 c 12 -4 24 -4 36 0 s 24 4 36 0" style={{ animationDelay: "-1.6s" }} />
            <path d="M120 150 c 16 -5 32 -5 48 0 s 32 5 48 0" style={{ animationDelay: "-3.1s" }} />
          </g>
        ) : null}
      </svg>

      <div className="sky-clouds">
        {CLOUD_PLACES.slice(0, CLOUDS[kind]).map((place, i) => (
          <svg
            key={i}
            className="sky-cloud"
            viewBox="0 0 120 52"
            style={{ "--top": place.top, "--scale": place.scale, "--dur": `${place.dur}s`, animationDelay: `${place.delay}s` } as Vars}
          >
            <path d="M22 46 a15 15 0 0 1 3 -29 a19 19 0 0 1 35 -7 a17 17 0 0 1 31 11 a13 13 0 0 1 4 25 z" />
          </svg>
        ))}
      </div>

      {wet ? (
        <div className="sky-rain" data-light={kind === "drizzle" || undefined}>
          <i />
          <i />
        </div>
      ) : null}
      {kind === "snow" ? (
        <div className="sky-snow">
          <i />
          <i />
        </div>
      ) : null}
      {kind === "fog" ? (
        <div className="sky-fog">
          <i />
          <i />
          <i />
        </div>
      ) : null}
      {kind === "storm" ? (
        <div className="sky-storm">
          <svg className="sky-bolt" viewBox="0 0 40 80">
            <path d="M24 0 L8 42 L20 42 L12 80 L34 30 L21 30 L30 0 Z" />
          </svg>
        </div>
      ) : null}
    </div>
  );
}
