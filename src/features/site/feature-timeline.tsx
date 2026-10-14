"use client";

import { useState } from "react";
import { Headset, LayoutDashboard, MessagesSquare, Send, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const ICONS = { school: LayoutDashboard, parents: Send, chat: MessagesSquare, support: Headset, trust: ShieldCheck } as const;
export type FeatureKey = keyof typeof ICONS;

/**
 * "What the system does", as a thread down the page: a small round mark with
 * the subject's icon, a hairline to the next, and beside each mark a card
 * with the first lines of what it says, fading out. A tap opens the card to
 * the whole text, and the next tap closes it.
 */
export function FeatureTimeline({ items }: { items: Array<{ key: FeatureKey; title: string; body: string }> }) {
  const [open, setOpen] = useState<FeatureKey | null>(null);
  return (
    <ol className="feature-line">
      {items.map(({ key, title, body }, index) => {
        const Icon = ICONS[key];
        const expanded = open === key;
        return (
          <li key={key} className="feature-step" style={{ animationDelay: `${120 + index * 110}ms` }}>
            <span className="feature-dot" aria-hidden>
              <Icon />
            </span>
            <button
              type="button"
              className={cn("feature-card", expanded && "feature-card-open")}
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : key)}
            >
              <span className="feature-title">{title}</span>
              <span className="feature-body">
                <span>{body}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
