import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A pupil's homework, or a topic from the class register, on a card of its
 * own: a warm dark ground — amber, coral, plum or olive, the same for the
 * same subject every time — with a soft light wandering over it and a few of
 * the school's drawings drifting slowly up its side (motion.css, "warm
 * cards"). Meant to make the day's work look like something to open, not a
 * row in a table.
 *
 * The whole card is the link when it has one.
 */

const TONES = ["amber", "coral", "plum", "olive"] as const;

/** The same subject always gets the same colour. */
export function toneFor(key: string): (typeof TONES)[number] {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length]!;
}

export function WarmCard({
  tone,
  href,
  eyebrow,
  title,
  side,
  children,
  compact = false,
}: {
  tone: (typeof TONES)[number];
  href?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  side?: ReactNode;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <li className={cn("warm-card", compact && "warm-card-compact")} data-tone={tone}>
      <span className="warm-card-glow" aria-hidden />
      <span className="warm-card-doodles" aria-hidden />
      <span className="warm-card-star" aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow ? <p className="warm-eyebrow">{eyebrow}</p> : null}
          <p className="warm-title">
            {href ? (
              <Link href={href} className="warm-link">
                {title}
              </Link>
            ) : (
              title
            )}
          </p>
          {children ? <div className="warm-meta">{children}</div> : null}
        </div>
        {side ? <div className="relative z-10 shrink-0 text-right">{side}</div> : null}
      </div>
    </li>
  );
}
