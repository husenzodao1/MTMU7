/**
 * The support desk's sign: a person at the desk with a headset, in a ring,
 * and half-rings running out from it on both sides like a voice carrying —
 * one after another, fading as they go (globals.css, .support-mark). Still
 * for whoever asked for less motion.
 */
const WAVES = [29, 37, 45];

/** A half-ring of radius r around (60, 38), on the right (side 1) or the left (side -1), 45° either way of the middle. */
function arc(r: number, side: 1 | -1) {
  const d = Math.round(r * Math.SQRT1_2 * 100) / 100;
  const x = 60 + side * d;
  return `M${x} ${38 - d} A${r} ${r} 0 0 ${side === 1 ? 1 : 0} ${x} ${38 + d}`;
}

export function SupportMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 76" className={["support-mark", className].filter(Boolean).join(" ")} aria-hidden>
      {WAVES.map((r, i) => (
        <g key={r} className="support-wave" style={{ "--i": i } as React.CSSProperties}>
          <path d={arc(r, -1)} />
          <path d={arc(r, 1)} />
        </g>
      ))}
      <circle cx="60" cy="38" r="22" className="support-ring" />
      <g className="support-person">
        <circle cx="60" cy="34" r="6" />
        <path d="M47.5 53 C47.5 46 53 42.5 60 42.5 C67 42.5 72.5 46 72.5 53" />
        <path d="M51.5 34 A8.5 8.5 0 0 1 68.5 34" />
        <rect x="49.5" y="32" width="3.5" height="6" rx="1.5" />
        <rect x="67" y="32" width="3.5" height="6" rx="1.5" />
        <path d="M68.8 38 C68.8 41.5 66.5 43 63.2 43" />
        <circle cx="62.2" cy="43" r="1.1" className="support-mic" />
      </g>
    </svg>
  );
}
