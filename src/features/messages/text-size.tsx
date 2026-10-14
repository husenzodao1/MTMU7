"use client";

import { Check } from "lucide-react";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import * as Overlay from "@/components/ui/overlay";
import { cn } from "@/lib/utils/cn";

/**
 * How large the words of a conversation are, chosen on this device, like its
 * wallpaper (wallpaper.tsx): a phone held at arm's length and a school
 * computer may want different ones. It sizes the messages, their quotes and
 * the box they are typed in; the times and ticks stay small.
 */
export const TEXT_SIZES = ["small", "medium", "large", "xlarge"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

/**
 * In pixels, not rem: the portal's root size is smaller than a browser's
 * (a rem is 14.5px on a phone), and the words of a conversation are read at
 * arm's length. Before there was a choice they were 12.7px.
 */
const PX: Record<TextSize, number> = { small: 14, medium: 16, large: 18, xlarge: 21 };
const DEFAULT: TextSize = "medium";

/** Not "chat-…": signing out leaves this choice, which is the device's, not the person's. */
const KEY = "mtmu7:chat-text-size";
const listeners = new Set<() => void>();

function read(): TextSize {
  try {
    const value = localStorage.getItem(KEY);
    return (TEXT_SIZES as readonly string[]).includes(value ?? "") ? (value as TextSize) : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTextSize(): [TextSize, (next: TextSize) => void] {
  const value = useSyncExternalStore(subscribe, read, () => DEFAULT);
  const set = useCallback((next: TextSize) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private window: this visit only */
    }
    for (const listener of listeners) listener();
  }, []);
  return [value, set];
}

/** Puts the chosen size where the messenger's styles read it (--chat-text, messenger.css). */
export function useChatTextSize() {
  const [size] = useTextSize();
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--chat-text", `${PX[size]}px`);
    return () => {
      root.style.removeProperty("--chat-text");
    };
  }, [size]);
}

export function TextSizeDialog({
  open,
  onOpenChange,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: { title: string; description: string; close: string; sample: string; names: Record<TextSize, string> };
}) {
  const [current, setCurrent] = useTextSize();
  return (
    <Overlay.Dialog open={open} onOpenChange={onOpenChange}>
      <Overlay.DialogContent title={labels.title} description={labels.description} closeLabel={labels.close} size="sm">
        <div className="chat-size-sample" aria-hidden>
          <p className="chat-bubble chat-bubble-theirs chat-tail-theirs px-2.5 pb-1.5 pt-1.5" style={{ fontSize: `${PX[current]}px` }}>
            {labels.sample}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label={labels.title}>
          {TEXT_SIZES.map((name) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={current === name}
              onClick={() => setCurrent(name)}
              className={cn(
                "flex min-h-14 items-center justify-between gap-2 rounded-xl px-3.5 py-2 text-start ring-1 ring-line transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                current === name && "ring-2 ring-brand-500"
              )}
            >
              <span className="leading-tight text-ink" style={{ fontSize: `${PX[name]}px` }}>
                {labels.names[name]}
              </span>
              {current === name ? <Check className="size-4 shrink-0 text-brand-600" aria-hidden /> : null}
            </button>
          ))}
        </div>
      </Overlay.DialogContent>
    </Overlay.Dialog>
  );
}
