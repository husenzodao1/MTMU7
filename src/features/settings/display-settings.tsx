"use client";

import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { applyTextSize, applyTheme, asTextSize, DEFAULT_TEXT_SIZE, TEXT_SIZES } from "@/lib/display-prefs";
import { isTheme, THEMES, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils/cn";

/**
 * A swatch per theme: two circles showing the page and the thing you press.
 * No words for the colours; the name underneath says what it is for.
 */
const SWATCH: Record<Theme, { page: string; accent: string }> = {
  system: { page: "linear-gradient(135deg, #f4f5f7 50%, #0e1317 50%)", accent: "#e3a130" },
  day: { page: "#f4f5f7", accent: "#e3a130" },
  night: { page: "#0e1317", accent: "#d9962b" },
  midnight: { page: "#0a0a0c", accent: "#bd8526" },
  verdant: { page: "#f4f5f7", accent: "#1f7a3e" },
  // The three that follow the device show both halves, like "system" does.
  ocean: { page: "linear-gradient(135deg, #f4f5f7 50%, #0e1317 50%)", accent: "#1f68be" },
  graphite: { page: "linear-gradient(135deg, #f4f5f7 50%, #0e1317 50%)", accent: "#1f252c" },
  lavender: { page: "linear-gradient(135deg, #f4f5f7 50%, #0e1317 50%)", accent: "#6545c0" },
};

/** What <html> says now: set by the server, the page's own script, or a choice made here. */
function watchRoot(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-text-size"] });
  return () => observer.disconnect();
}

function Swatch({ theme }: { theme: Theme }) {
  const swatch = SWATCH[theme];
  return (
    <span aria-hidden className="relative size-8 shrink-0 rounded-full border border-line-strong" style={{ background: swatch.page }}>
      <span className="absolute bottom-0 end-0 size-3.5 rounded-full border-2 border-surface" style={{ background: swatch.accent }} />
    </span>
  );
}

/**
 * The theme: the one in use, with an arrow at the end; a press opens all of
 * them under it, and a choice is on every page at once — this one, the ones
 * the app keeps, the ones still to open — with nothing loaded again.
 */
export function ThemePicker({ initial, names }: { initial: Theme; names: Record<Theme, { name: string; hint: string }> }) {
  const current = useSyncExternalStore(
    watchRoot,
    (): Theme => {
      const value = document.documentElement.getAttribute("data-theme");
      return value === null ? "system" : isTheme(value) ? value : initial;
    },
    () => initial
  );
  const [open, setOpen] = useState(false);
  const list = useId();

  return (
    <div className="theme-picker" data-open={open || undefined}>
      <button type="button" className="theme-picker-current" aria-expanded={open} aria-controls={list} onClick={() => setOpen((was) => !was)}>
        <Swatch theme={current} />
        <span className="min-w-0 flex-1 text-start">
          <span className="block truncate text-sm font-semibold text-ink">{names[current].name}</span>
          <span className="block truncate text-xs text-ink-muted">{names[current].hint}</span>
        </span>
        <ChevronDown className="theme-picker-arrow size-4 shrink-0 text-ink-muted" aria-hidden />
      </button>
      <div id={list} className="theme-picker-list" role="radiogroup" aria-label={names[current].name} hidden={!open}>
        {THEMES.map((theme, index) => {
          const on = theme === current;
          return (
            <button
              key={theme}
              type="button"
              role="radio"
              aria-checked={on}
              style={{ "--i": index } as React.CSSProperties}
              className={cn("theme-picker-option", on && "theme-picker-on")}
              onClick={() => {
                applyTheme(theme);
                setOpen(false);
              }}
            >
              <Swatch theme={theme} />
              <span className="min-w-0 flex-1 text-start">
                <span className="block truncate text-sm font-medium text-ink">{names[theme].name}</span>
                <span className="block truncate text-xs text-ink-muted">{names[theme].hint}</span>
              </span>
              {on ? <Check className="size-4 shrink-0 text-brand-text" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The size of the type everywhere, in ten steps. The row in Settings says the
 * step in use; a press opens a panel in the middle of the screen, drawn in
 * pixels so it stays the same size whatever the step, while the page behind it
 * grows and shrinks. "Done", or a press beside it, puts it away.
 */
export function TextSizePicker({
  initial,
  labels,
}: {
  initial: number;
  labels: { smaller: string; larger: string; level: string; sample: string; reset: string; done: string };
}) {
  const size = useSyncExternalStore(
    watchRoot,
    () => asTextSize(document.documentElement.getAttribute("data-text-size") ?? DEFAULT_TEXT_SIZE),
    () => initial
  );
  const [open, setOpen] = useState(false);
  const id = useId();
  const set = (next: number) => applyTextSize(Math.min(TEXT_SIZES, Math.max(1, next)));

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" className="text-size-current" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <span className="text-size-glyph" aria-hidden>
          Aa
        </span>
        <span className="min-w-0 flex-1 text-start text-sm text-ink-secondary">{labels.sample}</span>
        <span className="tabular shrink-0 text-xs font-semibold text-ink-muted">
          {size} / {TEXT_SIZES}
        </span>
        <ChevronDown className="size-4 shrink-0 text-ink-muted" aria-hidden />
      </button>
      {open
        ? createPortal(
            <div className="text-size-layer" onClick={(event) => event.target === event.currentTarget && setOpen(false)}>
              <div className="text-size-panel" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
                <div className="text-size-panel-head">
                  <span id={`${id}-title`}>{labels.level}</span>
                  <span className="tabular">
                    {size} / {TEXT_SIZES}
                  </span>
                </div>
                <div className="text-size-panel-row">
                  <button type="button" className="text-size-step" onClick={() => set(size - 1)} disabled={size <= 1} aria-label={labels.smaller}>
                    <Minus size={16} aria-hidden />
                  </button>
                  <div className="text-size-panel-track">
                    <input
                      id={id}
                      type="range"
                      min={1}
                      max={TEXT_SIZES}
                      step={1}
                      value={size}
                      onChange={(event) => set(Number(event.target.value))}
                      className="text-size-range"
                      aria-valuetext={`${size} / ${TEXT_SIZES}`}
                      aria-label={labels.level}
                    />
                    <div className="text-size-ticks" aria-hidden>
                      {Array.from({ length: TEXT_SIZES }, (_, i) => (
                        <span key={i} className={cn("text-size-tick", i + 1 === size && "text-size-tick-on")} />
                      ))}
                    </div>
                  </div>
                  <button type="button" className="text-size-step" onClick={() => set(size + 1)} disabled={size >= TEXT_SIZES} aria-label={labels.larger}>
                    <Plus size={16} aria-hidden />
                  </button>
                </div>
                <div className="text-size-panel-foot">
                  <button type="button" className="text-size-reset" onClick={() => set(DEFAULT_TEXT_SIZE)} disabled={size === DEFAULT_TEXT_SIZE}>
                    {labels.reset}
                  </button>
                  <button type="button" className="text-size-done" onClick={() => setOpen(false)} autoFocus>
                    {labels.done}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
