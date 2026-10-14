"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { REINSTALL_EVENT } from "@/components/shell/page-installer";
import { forgetKeptData } from "@/lib/kept-pages";

/** How far, after the drag's resistance, the mark may come down. */
const PULL_MAX = 96;
/** Let go past this and the page is refreshed. */
const ARM_AT = 62;
/** A refresh that the network keeps waiting is let go of on screen after this long. */
const GIVE_UP_MS = 12_000;

/** Something between the finger and the page that scrolls by itself and is not at its top. */
function scrolledInside(target: EventTarget | null) {
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    const style = getComputedStyle(el);
    if ((style.overflowY === "auto" || style.overflowY === "scroll") && el.scrollTop > 0) return true;
  }
  return false;
}

/**
 * Pull the page down from its top to refresh it, as in any app: a small
 * round mark follows the finger down, turning as it comes; let go past the
 * mark and it spins while the page is asked for again (router.refresh — the
 * page stays, and what is new appears in it). Pages are kept on the device
 * and never refresh by themselves, so this is how the newest of everything
 * is had: the page in front at once, every other page installed afresh
 * behind it.
 *
 * Only from the very top of the page, never over a dialog, and not where the
 * screen scrolls by itself (the messenger, which is live anyway).
 */
export function PullToRefresh({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const mark = useRef<HTMLDivElement>(null);
  const [refreshing, startRefresh] = useTransition();
  const busy = useRef(false);
  useEffect(() => {
    busy.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    if (disabled) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let pulling = false;
    let distance = 0;
    const show = (value: number, state?: string) => {
      const element = mark.current;
      if (!element) return;
      element.style.setProperty("--pull", String(value));
      if (state) element.dataset.state = state;
      else delete element.dataset.state;
    };
    const onStart = (event: TouchEvent) => {
      tracking = false;
      if (event.touches.length !== 1 || window.scrollY > 0 || mark.current?.dataset.state === "refreshing") return;
      if (document.documentElement.style.overflow === "hidden" || document.querySelector('[role="dialog"][data-state="open"]')) return;
      if (scrolledInside(event.target)) return;
      const touch = event.touches[0]!;
      startX = touch.clientX;
      startY = touch.clientY;
      tracking = true;
      pulling = false;
      distance = 0;
    };
    const onMove = (event: TouchEvent) => {
      if (!tracking) return;
      const touch = event.touches[0]!;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (!pulling) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        // Sideways, or up: a scroll or a swipe, not a pull.
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
          tracking = false;
          return;
        }
        pulling = true;
      }
      if (window.scrollY > 0) {
        tracking = false;
        show(0);
        return;
      }
      distance = Math.min(PULL_MAX, Math.max(0, dy) * 0.45);
      show(distance, distance >= ARM_AT ? "armed" : "pulling");
    };
    const onEnd = () => {
      if (!tracking || !pulling) {
        tracking = false;
        return;
      }
      tracking = false;
      if (distance >= ARM_AT) {
        navigator.vibrate?.(8);
        show(ARM_AT, "refreshing");
        // What the device kept of this page's data goes first, or the
        // refresh would be answered from it (public/sw.js).
        startRefresh(async () => {
          await forgetKeptData();
          router.refresh();
        });
        // Every other page installed afresh behind it, and a newer version of
        // the site taken if there is one (page-installer.tsx).
        window.dispatchEvent(new Event(REINSTALL_EVENT));
        // A refresh answered before it was ever pending leaves nothing to wait for.
        window.setTimeout(() => {
          if (!busy.current && mark.current?.dataset.state === "refreshing") show(0);
        }, 700);
      } else {
        show(0);
      }
      distance = 0;
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [disabled, router]);

  // Done — or kept waiting by a line that is not there: the mark goes back up.
  useEffect(() => {
    const element = mark.current;
    if (!element || element.dataset.state !== "refreshing") return;
    const hide = () => {
      element.style.setProperty("--pull", "0");
      delete element.dataset.state;
    };
    if (!refreshing) {
      const timer = window.setTimeout(hide, 250);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(hide, navigator.onLine ? GIVE_UP_MS : 900);
    return () => window.clearTimeout(timer);
  }, [refreshing]);

  if (disabled) return null;
  return (
    <div ref={mark} className="ptr" aria-hidden>
      <svg viewBox="0 0 24 24">
        <path d="M20 12a8 8 0 1 1-2.34-5.66" />
        <path d="M20 4v4.5h-4.5" />
      </svg>
    </div>
  );
}
