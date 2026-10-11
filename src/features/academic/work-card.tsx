import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A pupil's homework, or a topic from the class register, on a card of its
 * own: the subject as a small label, the title, what is due, and its status at
 * the side — plain surface and a hairline, so the day's work reads at a glance
 * and the one thing in colour is a status that needs attention.
 *
 * The whole card is the link when it has one.
 */
export function WorkCard({
  href,
  eyebrow,
  title,
  side,
  children,
  compact = false,
}: {
  href?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  side?: ReactNode;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <li className={cn("work-card", compact && "work-card-compact")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow ? <p className="work-eyebrow">{eyebrow}</p> : null}
          <p className="work-title">
            {href ? (
              <Link href={href} className="work-link">
                {title}
              </Link>
            ) : (
              title
            )}
          </p>
          {children ? <div className="work-meta">{children}</div> : null}
        </div>
        {side ? <div className="relative z-10 shrink-0 text-right">{side}</div> : null}
      </div>
    </li>
  );
}
