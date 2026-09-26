"use client";

import { Bell, Check, MapPin, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { nativePush } from "@/features/native/bridge";
import { enablePush, pushState, registerWorker, syncPush, type PushState } from "@/features/push/client";
import { cn } from "@/lib/utils/cn";

type GeoState = "granted" | "denied" | "prompt" | "unsupported";

const DISMISS_KEY = "device-permissions-dismissed-at";
const ASK_AGAIN_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

async function geoState(): Promise<GeoState> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return "unsupported";
  try {
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state as GeoState;
  } catch {
    // Safari before 16 cannot say; offering the button is the honest answer.
    return "prompt";
  }
}

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && Date.now() - at < ASK_AGAIN_AFTER_MS;
  } catch {
    return false;
  }
}

/**
 * The two questions a signed-in person is asked once: may the portal tell you
 * about a message when it is closed, and may the chat send where you are.
 *
 * Asked by the portal, in its own words, before the browser asks in its own —
 * a bare browser prompt on arrival is the one people refuse by reflex, and a
 * refusal there cannot be taken back from a web page. Each button is the tap
 * the browser needs; "later" puts the card away for a week. Nothing is asked
 * that the device cannot do.
 */
export function DevicePermissions({ locale, userId }: { locale: string; userId: string }) {
  const t = useTranslations("common.permissions");
  const [push, setPush] = useState<PushState>("unsupported");
  const [geo, setGeo] = useState<GeoState>("unsupported");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"push" | "geo" | null>(null);

  const [native, setNative] = useState<Awaited<ReturnType<typeof nativePush>>>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // In the phone app notifications come from Firebase, not Web Push; the
      // question and the card are the same.
      const app = await nativePush();
      let notifications: PushState;
      if (app) {
        notifications = await app.state();
        if (notifications === "granted") void app.sync(locale);
      } else {
        void registerWorker();
        void syncPush(locale, userId);
        notifications = pushState();
      }
      const location = await geoState();
      if (cancelled) return;
      setNative(app);
      setPush(notifications);
      setGeo(location);
      setOpen((notifications === "default" || location === "prompt") && !dismissedRecently());
    })();
    return () => {
      cancelled = true;
    };
  }, [locale, userId]);

  if (!open) return null;

  const later = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Without storage the card comes back next visit, which is acceptable.
    }
    setOpen(false);
  };

  const finishIfDone = (nextPush: PushState, nextGeo: GeoState) => {
    const pushDone = nextPush !== "default";
    const geoDone = nextGeo !== "prompt";
    if (pushDone && geoDone) window.setTimeout(() => setOpen(false), 900);
  };

  const askPush = async () => {
    setBusy("push");
    const answer = native ? await native.enable(locale) : await enablePush(locale);
    setBusy(null);
    setPush(answer);
    finishIfDone(answer, geo);
  };

  const askGeo = () => {
    setBusy("geo");
    navigator.geolocation.getCurrentPosition(
      () => {
        // Only the permission is wanted here. The position itself is dropped
        // on the floor: nothing is sent until somebody taps the pin in a chat.
        setBusy(null);
        setGeo("granted");
        finishIfDone(push, "granted");
      },
      (error) => {
        setBusy(null);
        const next: GeoState = error.code === error.PERMISSION_DENIED ? "denied" : "prompt";
        setGeo(next);
        finishIfDone(push, next);
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 }
    );
  };

  return (
    <aside
      role="dialog"
      aria-labelledby="device-permissions-title"
      // Under the header on a phone, where the bottom bar and the support
      // button already share the lower edge; bottom-left on a wider screen.
      className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 mx-auto max-w-sm animate-fade rounded-2xl border border-line bg-surface p-4 shadow-overlay sm:inset-x-auto sm:start-5 sm:top-auto sm:bottom-5 lg:bottom-6 print:hidden"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="device-permissions-title" className="text-sm font-semibold text-ink">
            {t("title")}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">{t("text")}</p>
        </div>
        <button type="button" onClick={later} className="-m-1 rounded-md p-1 text-ink-muted hover:bg-surface-muted hover:text-ink" aria-label={t("later")}>
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {push !== "unsupported" ? (
          <PermissionRow
            icon={<Bell className="size-4" aria-hidden />}
            label={t("notifications")}
            hint={t("notificationsHint")}
            state={push === "default" ? "ask" : push === "granted" ? "on" : "blocked"}
            busy={busy === "push"}
            onAsk={askPush}
            words={{ allow: t("allow"), allowed: t("allowed"), blocked: t("blocked") }}
          />
        ) : null}
        {geo !== "unsupported" ? (
          <PermissionRow
            icon={<MapPin className="size-4" aria-hidden />}
            label={t("location")}
            hint={t("locationHint")}
            state={geo === "prompt" ? "ask" : geo === "granted" ? "on" : "blocked"}
            busy={busy === "geo"}
            onAsk={askGeo}
            words={{ allow: t("allow"), allowed: t("allowed"), blocked: t("blocked") }}
          />
        ) : null}
      </ul>

      {push === "denied" || geo === "denied" ? <p className="mt-2 text-[0.6875rem] leading-snug text-ink-muted">{t("blockedHint")}</p> : null}

      <div className="mt-3 flex justify-end">
        <button type="button" onClick={later} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-surface-muted hover:text-ink">
          {t("later")}
        </button>
      </div>
    </aside>
  );
}

function PermissionRow({
  icon,
  label,
  hint,
  state,
  busy,
  onAsk,
  words,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  state: "ask" | "on" | "blocked";
  busy: boolean;
  onAsk: () => void;
  words: { allow: string; allowed: string; blocked: string };
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-surface-muted px-3 py-2.5">
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", state === "on" ? "bg-success-50 text-success-600" : "bg-brand-50 text-brand-text")}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block truncate text-xs text-ink-muted">{hint}</span>
      </span>
      {state === "ask" ? (
        <button
          type="button"
          onClick={onAsk}
          disabled={busy}
          className="shrink-0 rounded-full bg-brand-solid px-3 py-1.5 text-xs font-semibold text-brand-on-solid transition-colors hover:bg-brand-solid-hover disabled:opacity-60"
        >
          {words.allow}
        </button>
      ) : state === "on" ? (
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-success-600">
          <Check className="size-3.5" aria-hidden />
          {words.allowed}
        </span>
      ) : (
        <span className="shrink-0 text-xs font-medium text-ink-muted">{words.blocked}</span>
      )}
    </li>
  );
}
