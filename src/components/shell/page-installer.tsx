"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download } from "lucide-react";
import { warmPages } from "@/components/shell/warm-pages";
import { forgetInstalled, readInstalled, saveInstalled } from "@/lib/kept-pages";

/** Sent by the pull at the top of a page: install every page again, quietly. */
export const REINSTALL_EVENT = "mtmu7:reinstall";

/** The welcome after signing in (welcome-transition.tsx) plays first; the installer waits for it. */
const WELCOME_VEIL = "data-signin-veil";

/** How long the service worker is given for the whole list before the screen lets go. */
const GIVE_UP_MS = 5 * 60_000;

interface Progress {
  done: number;
  total: number;
  finished: boolean;
}

/**
 * Every page this person can open, installed on the phone right after they
 * sign in — "Насби саҳифаҳо", with the count going up — so that from then on
 * no page waits for the network: the service worker keeps each one with its
 * scripts and styles (public/sw.js, keep-pages), and the app's memory holds
 * them ready for a tap (warm-pages.ts).
 *
 * After that, the page in front keeps itself up to date (quiet-refresh.ts),
 * and a pull at the top of a page installs everything afresh, quietly, and
 * takes a new version of the site if there is one. A new version opened any
 * other way has the rest of the pages installed in it the same way.
 */
export function PageInstaller({ userId }: { userId: string }) {
  const t = useTranslations("common.install");
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [shown, setShown] = useState(false);
  const running = useRef(false);

  const install = useCallback(
    async (visible: boolean, reloadIfNewer = !visible) => {
      if (running.current) return;
      running.current = true;
      try {
        const answer = await fetch("/api/app/pages", { cache: "no-store", credentials: "same-origin" });
        if (!answer.ok) return;
        const { build, pages } = (await answer.json()) as { build: string; pages: string[] };
        if (!Array.isArray(pages) || pages.length === 0) return;
        if (visible) {
          setProgress({ done: 0, total: pages.length, finished: false });
          setShown(true);
        }
        await keepOnDevice(pages, (done, total) => {
          if (visible) setProgress({ done, total, finished: false });
        });
        warmPages(router, pages);
        saveInstalled({ user: userId, build, at: Date.now(), pages });
        if (visible) {
          setProgress({ done: pages.length, total: pages.length, finished: true });
          window.setTimeout(() => setShown(false), 1600);
        }
        // A pull that found a newer site: open it — from the pages just installed.
        const here = document.documentElement.dataset.build;
        if (reloadIfNewer && here && here !== "local" && build && build !== here) window.location.reload();
      } catch {
        // No line: tried again on the next pull, or the next time the app opens.
      } finally {
        running.current = false;
      }
    },
    [router, userId]
  );

  useEffect(() => {
    const record = readInstalled();
    let timer = 0;
    let stopped = false;
    const begin = () => {
      if (stopped) return;
      if (document.documentElement.hasAttribute(WELCOME_VEIL)) {
        timer = window.setTimeout(begin, 400);
        return;
      }
      if (navigator.onLine) void install(true);
      else window.addEventListener("online", () => void install(true), { once: true });
    };
    const here = document.documentElement.dataset.build;
    if (!record || record.user !== userId) {
      // Somebody else's pages, or none: whoever signs in gets their own.
      if (record) forgetInstalled();
      timer = window.setTimeout(begin, 900);
    } else if (here && here !== "local" && record.build !== here) {
      // A newer version of the site is open (a quiet refresh found it,
      // public/sw.js): the rest of the pages are installed in it, quietly.
      timer = window.setTimeout(() => void install(false, false), 3000);
    }
    const again = () => void install(false);
    window.addEventListener(REINSTALL_EVENT, again);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener(REINSTALL_EVENT, again);
    };
  }, [install, userId]);

  // The app's back button closes an open dialog with Escape (native-app.tsx):
  // here it sends the installing behind, never stops it.
  useEffect(() => {
    if (!shown) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShown(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shown]);

  if (!shown || !progress) return null;
  const share = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="page-installer-title"
      data-state="open"
      className="fixed inset-0 z-[80] grid place-items-center bg-ink/45 p-6 animate-fade print:hidden"
    >
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center shadow-overlay">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-brand-50 text-brand-text">
          {progress.finished ? <Check className="size-7" aria-hidden /> : <Download className="size-7 motion-safe:animate-bounce" aria-hidden />}
        </div>
        <h2 id="page-installer-title" className="text-lg font-semibold text-ink">
          {progress.finished ? t("doneTitle") : t("title")}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{progress.finished ? t("doneText") : t("text")}</p>
        <div
          className="mt-5 h-2 overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          aria-label={t("title")}
        >
          <div className="h-full rounded-full bg-brand-solid transition-[width] duration-300" style={{ width: `${share}%` }} />
        </div>
        <p className="mt-2 text-xs tabular text-ink-muted">{t("count", { done: progress.done, total: progress.total })}</p>
        {!progress.finished ? (
          <button
            type="button"
            onClick={() => setShown(false)}
            className="mt-4 rounded-lg px-3 py-2 text-sm font-medium text-brand-text hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {t("background")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The service worker installs the pages; the progress comes back on a port of its own. */
async function keepOnDevice(paths: string[], onProgress: (done: number, total: number) => void): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 4000)),
  ]);
  const worker = navigator.serviceWorker.controller ?? registration?.active ?? null;
  if (!worker) return;
  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(resolve, GIVE_UP_MS);
    channel.port1.onmessage = (event: MessageEvent<{ type: string; done: number; total: number }>) => {
      if (event.data?.type === "progress") onProgress(event.data.done, event.data.total);
      if (event.data?.type === "done") {
        window.clearTimeout(timer);
        resolve();
      }
    };
    worker.postMessage({ type: "keep-pages", paths }, [channel.port2]);
  });
}
