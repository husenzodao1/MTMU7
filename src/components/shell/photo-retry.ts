"use client";

import { useEffect } from "react";

/** A photo that could not come is asked for again this often while the page is open. */
const AGAIN_MS = 15_000;

/**
 * A photo that could not come — no line, a line that dropped it — is never
 * shown as the browser's broken picture: it is hidden (img[data-broken],
 * globals.css), leaving what is under it (an avatar's initials), and asked for
 * again when the line comes back, and every little while until it comes.
 */
export function usePhotoRetry() {
  useEffect(() => {
    const broken = new Set<HTMLImageElement>();
    // Photos from the school's storage, straight or through Next.js's resizer — not the site's own icons.
    const isPhoto = (target: EventTarget | null): target is HTMLImageElement =>
      target instanceof HTMLImageElement && /\/storage\/v1\/|\/_next\/image\?/.test(target.currentSrc || target.src);
    const onError = (event: Event) => {
      if (!isPhoto(event.target)) return;
      event.target.setAttribute("data-broken", "");
      broken.add(event.target);
    };
    const onLoad = (event: Event) => {
      if (!isPhoto(event.target) || !event.target.hasAttribute("data-broken")) return;
      event.target.removeAttribute("data-broken");
      broken.delete(event.target);
    };
    const again = () => {
      if (!navigator.onLine) return;
      for (const image of broken) {
        if (!image.isConnected) {
          broken.delete(image);
          continue;
        }
        const src = image.getAttribute("src");
        if (!src) continue;
        image.removeAttribute("src");
        image.setAttribute("src", src);
      }
    };
    document.addEventListener("error", onError, true);
    document.addEventListener("load", onLoad, true);
    // Those that failed before the page could listen.
    for (const image of Array.from(document.images)) {
      if (isPhoto(image) && image.complete && image.naturalWidth === 0) {
        image.setAttribute("data-broken", "");
        broken.add(image);
      }
    }
    window.addEventListener("online", again);
    const timer = window.setInterval(() => broken.size > 0 && again(), AGAIN_MS);
    return () => {
      document.removeEventListener("error", onError, true);
      document.removeEventListener("load", onLoad, true);
      window.removeEventListener("online", again);
      window.clearInterval(timer);
    };
  }, []);
}
