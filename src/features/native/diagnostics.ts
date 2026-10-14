"use client";

import { isInApp } from "@/features/native/bridge";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * A few plain facts from inside the phone app, for the next "it does not
 * work": whether Capacitor's bridge arrived, which plugins it brought, how long
 * the page took to wake, what the Google sheet answered, what went wrong.
 *
 * Only inside the app, and never a password, an address or a message — the
 * database keeps the event, the path without its query and a small detail,
 * under a random id that stands for the installation (00075).
 */

interface Event {
  event: string;
  path: string;
  detail: Record<string, unknown>;
}

const DEVICE_KEY = "app-device-id";
const queue: Event[] = [];
let timer: number | null = null;

function device(): string {
  try {
    const known = localStorage.getItem(DEVICE_KEY);
    if (known) return known;
    const made = `dev_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    localStorage.setItem(DEVICE_KEY, made);
    return made;
  } catch {
    return "dev_nostorage";
  }
}

function flush() {
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
  const events = queue.splice(0, 25);
  if (events.length === 0) return;
  void getBrowserClient()
    .rpc("log_app_diagnostics", { p_device: device(), p_user_agent: navigator.userAgent, p_events: events as never })
    .then(
      () => undefined,
      () => undefined
    );
}

/** Notes one fact; `now` sends it at once, for what comes right before leaving the page. */
export function report(event: string, detail: Record<string, unknown> = {}, now = false) {
  if (!isInApp()) return;
  queue.push({ event, path: location.pathname, detail });
  if (now || queue.length >= 20) flush();
  else timer ??= window.setTimeout(flush, 1200);
}

/** Uncaught errors on this page, the first few of them. */
export function watchErrors(): () => void {
  if (!isInApp()) return () => undefined;
  let left = 5;
  const note = (message: unknown, where?: string) => {
    if (left-- <= 0) return;
    report("error", { message: String(message).slice(0, 300), where: where?.split("/").pop()?.slice(0, 80) });
  };
  const onError = (event: ErrorEvent) => note(event.message, `${event.filename}:${event.lineno}`);
  const onRejection = (event: PromiseRejectionEvent) =>
    note(event.reason instanceof Error ? `${event.reason.name}: ${event.reason.message}` : event.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
