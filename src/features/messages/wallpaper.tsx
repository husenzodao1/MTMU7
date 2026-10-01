"use client";

import { Check } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import * as Overlay from "@/components/ui/overlay";
import { cn } from "@/lib/utils/cn";

/**
 * The picture behind the conversation, chosen on this device.
 *
 * Kept in the browser rather than in the account, like the messenger it
 * copies: a phone and a school computer may well want different ones, and it
 * is nobody else's business. Every wallpaper is drawn from the chat's own
 * colours, so each works by day and by night.
 */
export const WALLPAPERS = ["doodle", "plain", "dots", "mint", "sky", "peach", "lavender", "brand", "graphite"] as const;
export type Wallpaper = (typeof WALLPAPERS)[number];

const KEY = "chat-wallpaper";
const listeners = new Set<() => void>();

function read(): Wallpaper {
  try {
    const value = localStorage.getItem(KEY);
    return (WALLPAPERS as readonly string[]).includes(value ?? "") ? (value as Wallpaper) : "doodle";
  } catch {
    return "doodle";
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

export function useWallpaper(): [Wallpaper, (next: Wallpaper) => void] {
  const value = useSyncExternalStore(subscribe, read, () => "doodle" as Wallpaper);
  const set = useCallback((next: Wallpaper) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private window: this visit only */
    }
    for (const listener of listeners) listener();
  }, []);
  return [value, set];
}

export function WallpaperDialog({
  open,
  onOpenChange,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: { title: string; description: string; close: string; names: Record<Wallpaper, string> };
}) {
  const [current, setCurrent] = useWallpaper();
  return (
    <Overlay.Dialog open={open} onOpenChange={onOpenChange}>
      <Overlay.DialogContent title={labels.title} description={labels.description} closeLabel={labels.close} size="sm">
        <div className="grid grid-cols-3 gap-2.5">
          {WALLPAPERS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setCurrent(name)}
              aria-pressed={current === name}
              className={cn(
                "group relative overflow-hidden rounded-xl text-start ring-1 ring-line transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                current === name && "ring-2 ring-brand-500"
              )}
            >
              <span className="chat-wall block h-24" data-wallpaper={name}>
                <span className="chat-bubble chat-bubble-theirs ms-2 mt-3 block h-3 w-12" />
                <span className="chat-bubble chat-bubble-mine me-2 ms-auto mt-2 block h-3 w-14" />
              </span>
              <span className="block truncate bg-surface px-2 py-1.5 text-xs font-medium text-ink">{labels.names[name]}</span>
              {current === name ? (
                <span className="absolute end-1.5 top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-brand-solid text-brand-on-solid">
                  <Check className="size-3.5" aria-hidden />
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </Overlay.DialogContent>
    </Overlay.Dialog>
  );
}
