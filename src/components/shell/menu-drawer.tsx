"use client";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * The phone's menu, pulled out from the left edge by a finger.
 *
 * It follows the finger: a swipe to the right anywhere on the page draws the
 * panel out exactly as far as the finger has gone, and letting go finishes the
 * movement — open if the panel is more than half out or the finger was moving
 * that way, closed otherwise — at the speed the finger had, so a flick snaps
 * and a slow drag settles. A swipe back to the left on the panel or the dimmed
 * page closes it the same way. The burger button opens and closes it with the
 * same easing.
 *
 * Nothing in it takes the focus by itself: the panel is focused as a whole, so
 * the search box (in the office) waits for a tap and the phone's keyboard does
 * not jump up every time the menu is opened.
 *
 * While it is open the rest of the page is inert (no focus, no screen reader,
 * no scrolling behind it); Escape and a tap on the dimmed page close it.
 */

/** Where a touch may not start a swipe: things that move sideways themselves. */
function movesSideways(target: EventTarget | null) {
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    if (el.matches("input, textarea, select, [contenteditable='true'], [role='slider'], [data-swipe='own']")) return true;
    const style = getComputedStyle(el);
    if ((style.overflowX === "auto" || style.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1) return true;
  }
  return false;
}

/** Another overlay (a dialog, a menu, a sheet) is open: swipes belong to it. */
function otherOverlayOpen(panel: HTMLElement | null) {
  return Array.from(document.querySelectorAll('[role="dialog"][data-state="open"], [role="menu"][data-state="open"]')).some((el) => !panel?.contains(el));
}

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Moves the panel to `p` (0 shut, 1 open), over `ms` (0: it follows the finger). */
function place(el: HTMLElement | null, p: number, ms: number) {
  if (!el) return;
  el.style.setProperty("--p", String(p));
  el.style.setProperty("--dur", `${Math.round(ms)}ms`);
  el.dataset.state = ms === 0 ? "dragging" : p > 0 ? "open" : "closed";
  // Android's back button closes whatever dialog is open (native-app.tsx).
  el.querySelector('[role="dialog"]')?.setAttribute("data-state", p > 0 ? "open" : "closed");
}

const noSubscribe = () => () => {};
/** A finger moving at least this fast (px/ms) decides the direction by itself. */
const FLICK = 0.32;

type Vars = CSSProperties & Record<`--${string}`, string | number>;

export function MenuDrawer({
  open,
  onOpenChange,
  label,
  appRoot,
  trigger,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The panel's name for screen readers. */
  label: string;
  /** The page behind, made inert while the panel is open. */
  appRoot: RefObject<HTMLElement | null>;
  /** The button that opens it, which gets the focus back when it closes. */
  trigger: RefObject<HTMLElement | null>;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Rendered into <body>, which exists only in the browser.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const openRef = useRef(open);

  // Opened or closed from outside (the burger, a link, Escape, the dimmed page).
  useLayoutEffect(() => {
    if (!mounted) return;
    const wasOpen = openRef.current;
    openRef.current = open;
    const current = Number(root.current?.style.getPropertyValue("--p") || 0);
    const target = open ? 1 : 0;
    if (root.current?.dataset.state === "dragging") return;
    if (current !== target || wasOpen !== open) place(root.current, target, 300 * Math.max(0.45, Math.abs(target - current)));
  }, [open, mounted]);

  // The page behind: inert and still while the panel is open.
  useEffect(() => {
    if (!mounted) return;
    const app = appRoot.current;
    const html = document.documentElement;
    if (open) {
      app?.setAttribute("inert", "");
      html.style.overflow = "hidden";
      // The panel as a whole, never the first field in it.
      panel.current?.focus({ preventScroll: true });
    } else {
      app?.removeAttribute("inert");
      html.style.overflow = "";
      if (panel.current?.contains(document.activeElement)) trigger.current?.focus({ preventScroll: true });
    }
    return () => {
      app?.removeAttribute("inert");
      html.style.overflow = "";
    };
  }, [open, mounted, appRoot, trigger]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !otherOverlayOpen(panel.current)) onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // The finger.
  useEffect(() => {
    if (!mounted) return;
    type Gesture = { x: number; y: number; from: number; dragging: boolean; width: number; dx0: number; samples: Array<{ x: number; t: number }> };
    let g: Gesture | null = null;

    const onStart = (event: TouchEvent) => {
      g = null;
      if (event.touches.length !== 1 || window.innerWidth >= 1024) return;
      const target = event.target;
      const isOpen = openRef.current;
      if (isOpen) {
        if (!(target instanceof Node) || !root.current?.contains(target)) return;
      } else if (movesSideways(target) || otherOverlayOpen(panel.current)) {
        return;
      }
      const touch = event.touches[0]!;
      g = { x: touch.clientX, y: touch.clientY, from: isOpen ? 1 : 0, dragging: false, width: 0, dx0: 0, samples: [] };
    };

    const onMove = (event: TouchEvent) => {
      if (!g) return;
      const touch = event.touches[0]!;
      const dx = touch.clientX - g.x;
      const dy = touch.clientY - g.y;
      if (!g.dragging) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          g = null; // a scroll, not a swipe
          return;
        }
        const towards = g.from === 0 ? dx > 0 : dx < 0;
        if (Math.abs(dx) < 10 || !towards || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        g.dragging = true;
        g.width = panel.current?.offsetWidth || 320;
        g.dx0 = dx;
      }
      event.preventDefault();
      const p = Math.min(1, Math.max(0, g.from + (dx - g.dx0) / g.width));
      place(root.current, p, 0);
      const now = performance.now();
      g.samples.push({ x: touch.clientX, t: now });
      while (g.samples.length > 2 && now - g.samples[0]!.t > 100) g.samples.shift();
    };

    const onEnd = () => {
      if (!g?.dragging) {
        g = null;
        return;
      }
      const p = Number(root.current?.style.getPropertyValue("--p") || 0);
      const first = g.samples[0];
      const last = g.samples[g.samples.length - 1];
      const v = first && last && last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
      const target = v > FLICK ? 1 : v < -FLICK ? 0 : p > 0.5 ? 1 : 0;
      // The rest of the way at the finger's own speed, within reason.
      const remaining = Math.abs(target - p) * g.width;
      const ms = Math.min(340, Math.max(140, remaining / Math.max(Math.abs(v), 0.9)));
      g = null;
      place(root.current, target, ms);
      openRef.current = target === 1;
      onOpenChange(target === 1);
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [mounted, onOpenChange]);

  if (!mounted) return null;
  return createPortal(
    <div ref={root} className="menu-drawer lg:hidden" data-state="closed" style={{ "--p": 0, "--dur": "0ms", "--ease": EASE } as Vars}>
      <div className="menu-drawer-scrim" aria-hidden onClick={() => onOpenChange(false)} />
      <div
        ref={panel}
        id="menu-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-hidden={!open}
        tabIndex={-1}
        className="menu-drawer-panel safe-top safe-bottom focus:outline-none"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer ? <div className="shrink-0">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
