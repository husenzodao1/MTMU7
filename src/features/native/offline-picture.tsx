/**
 * The picture on the cover that says the internet is gone (offline-cover.tsx;
 * the app's own mobile/www/offline.html draws the same one in plain HTML):
 *
 *   0.25  the three waves of the Wi-Fi sign light up one after another, as if
 *         it were connecting
 *   1.25  a graduation cap drops from above and lands on it with a bounce
 *   1.60  the waves crack and fall apart, a little dust, a zigzag crack
 *   4.40  the cap lifts away, the waves come back together — and it tries
 *         again, every five seconds, for as long as there is no connection.
 *
 * With `back` the waves light up green and stay: the connection has returned.
 * Markup only; the movement is in motion.css ("no connection").
 */

const ARCS = [
  { left: "M78.6 132A28 28 0 0 1 100 122", right: "M100 122A28 28 0 0 1 121.4 132" },
  { left: "M60.2 116.6A52 52 0 0 1 100 98", right: "M100 98A52 52 0 0 1 139.8 116.6" },
  { left: "M41.8 101.1A76 76 0 0 1 100 74", right: "M100 74A76 76 0 0 1 158.2 101.1" },
];

export function OfflinePicture({ back = false }: { back?: boolean }) {
  return (
    <svg viewBox="0 0 200 190" className="offline-picture" data-back={back || undefined} aria-hidden>
      <g fill="none" strokeWidth="11" strokeLinecap="round">
        {ARCS.map((arc, index) => (
          <g key={index} className={`offline-arc offline-arc-${index + 1}`}>
            <g className="offline-half offline-half-left">
              <path className="offline-dim" d={arc.left} />
              <path className="offline-lit" d={arc.left} />
            </g>
            <g className="offline-half offline-half-right">
              <path className="offline-dim" d={arc.right} />
              <path className="offline-lit" d={arc.right} />
            </g>
          </g>
        ))}
      </g>
      <circle className="offline-dot" cx="100" cy="150" r="9" />

      <path className="offline-crack" d="M100 70 L94 86 L105 98 L96 114 L104 124" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <g className="offline-dust">
        <circle cx="70" cy="72" r="2.4" />
        <circle cx="128" cy="70" r="2" />
        <circle cx="84" cy="62" r="1.6" />
        <circle cx="118" cy="60" r="1.8" />
      </g>

      <g className="offline-cap">
        <path d="M80 56 L80 68 Q100 78 120 68 L120 56 Z" fill="#26386a" />
        <path d="M100 34 L144 49 L100 64 L56 49 Z" fill="#1c2950" stroke="#3a4f8f" strokeWidth="1.4" />
        <path d="M100 49 L136 52 L137 70" fill="none" stroke="#f5c542" strokeWidth="2" strokeLinecap="round" />
        <path d="M133.5 68 L140.5 68 L141.5 79 L132.5 79 Z" fill="#f5c542" />
        <circle cx="100" cy="49" r="2.8" fill="#f5c542" />
      </g>
    </svg>
  );
}
