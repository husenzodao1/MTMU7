/**
 * The four networks drawn in a single hairline, for the menu and the footer:
 * no disc, no fill, the same 1.5 stroke on the same 24-unit grid as the
 * portal's other icons, so they sit in a row with them and read as one family.
 *
 * Each is reduced to what makes it recognisable at sixteen pixels — the
 * folded plane, the rounded camera with its lens and light, the speech
 * bubble with its handset, the crossed strokes — and nothing more. The filled
 * marks in social-icons.tsx stay for the support page, where the real colours
 * help somebody find the right app.
 */

type Props = { className?: string };

const common = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function TelegramLine({ className }: Props) {
  return (
    <svg {...common} className={className}>
      <path d="M20.6 4.3 3.4 11.1c-.5.2-.5.9 0 1.1l4.1 1.6 1.7 5.3c.15.45.7.6 1.05.27l2.45-2.3 4.4 3.25c.4.3 1 .08 1.1-.42L21.5 5.2c.12-.6-.36-1.06-.9-.9Z" />
      <path d="m7.5 13.8 9.3-5.9-6.4 6.3-.5 4.6" />
    </svg>
  );
}

export function InstagramLine({ className }: Props) {
  return (
    <svg {...common} className={className}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="3.9" />
      <circle cx="16.95" cy="7.05" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function WhatsAppLine({ className }: Props) {
  return (
    <svg {...common} className={className}>
      <path d="M4.2 19.8 5.3 16A8.4 8.4 0 1 1 8.3 18.9Z" />
      <path d="M9.4 8.3c-.45 0-.95.45-.95 1.05 0 3.45 2.75 6.2 6.2 6.2.6 0 1.05-.5 1.05-.95v-.75l-1.7-.7-.85.85a5 5 0 0 1-2.95-2.95l.85-.85-.7-1.7Z" />
    </svg>
  );
}

export function XLine({ className }: Props) {
  return (
    <svg {...common} className={className}>
      <path d="M4.8 4.5h3.9l10.5 15h-3.9Z" />
      <path d="m19 4.5-5.8 6.6M10.8 12.9 5 19.5" />
    </svg>
  );
}

export const SOCIAL_LINE = {
  telegram: TelegramLine,
  instagram: InstagramLine,
  whatsapp: WhatsAppLine,
  x: XLine,
} as const;
