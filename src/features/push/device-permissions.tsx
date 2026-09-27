"use client";

import { Bell, Camera, Check, MapPin, Mic, Settings, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { devicePermissionsPlugin, nativePush, type DevicePermission, type DevicePermissionStates } from "@/features/native/bridge";
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
  const [app, setApp] = useState<Awaited<ReturnType<typeof devicePermissionsPlugin>> | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void devicePermissionsPlugin().then((plugin) => {
      if (!cancelled) setApp(plugin);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  if (app === undefined) return null;
  // The phone app asks Android itself (it asked once already, on its first
  // launch); a browser, or an app built before the plugin, asks the web way.
  return app ? <AppPermissions plugin={app} locale={locale} /> : <BrowserPermissions locale={locale} userId={userId} />;
}

const APP_PERMISSIONS: DevicePermission[] = ["notifications", "location", "camera", "microphone"];

/**
 * In the phone app: the four things the app asked for on its first launch,
 * and only if one of them was refused. A refusal that can still be asked
 * about gets "Allow", which brings Android's own dialog back; one refused for
 * good gets "Settings", the app's page in Android settings. Looked at again
 * whenever the app comes back to the front, so a switch turned on there shows
 * here at once.
 */
function AppPermissions({ plugin, locale }: { plugin: NonNullable<Awaited<ReturnType<typeof devicePermissionsPlugin>>>; locale: string }) {
  const t = useTranslations("common.permissions");
  const [states, setStates] = useState<DevicePermissionStates | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<DevicePermission | null>(null);

  const apply = useCallback(
    (next: DevicePermissionStates, first: boolean) => {
      setStates(next);
      // Notifications allowed: this phone's token goes to the school.
      if (next.notifications === "granted") void nativePush().then((push) => push?.sync(locale));
      const missing = APP_PERMISSIONS.some((key) => next[key] !== "granted");
      if (first) setOpen(missing && !dismissedRecently());
      else if (!missing) window.setTimeout(() => setOpen(false), 900);
    },
    [locale]
  );

  useEffect(() => {
    let cancelled = false;
    const look = (first: boolean) =>
      plugin.check().then(
        (next) => {
          if (!cancelled) apply(next, first);
        },
        () => undefined
      );
    void look(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") void look(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [plugin, apply]);

  if (!open || !states) return null;

  const ask = async (key: DevicePermission) => {
    setBusy(key);
    try {
      apply(await plugin.request({ which: [key] }), false);
    } catch {
      // The dialog could not be shown; the row stays as it was.
    }
    setBusy(null);
  };

  const icons: Record<DevicePermission, React.ReactNode> = {
    notifications: <Bell className="size-4" aria-hidden />,
    location: <MapPin className="size-4" aria-hidden />,
    camera: <Camera className="size-4" aria-hidden />,
    microphone: <Mic className="size-4" aria-hidden />,
  };

  return (
    <PermissionsCard title={t("appTitle")} text={t("appText")} onLater={() => laterFor(setOpen)} laterLabel={t("later")}>
      {APP_PERMISSIONS.map((key) => (
        <PermissionRow
          key={key}
          icon={icons[key]}
          label={t(key)}
          hint={t(`${key}Hint`)}
          state={states[key] === "granted" ? "on" : states[key] === "prompt" ? "ask" : "settings"}
          busy={busy === key}
          onAsk={() => void ask(key)}
          onSettings={() => void plugin.openSettings()}
          words={{ allow: t("allow"), allowed: t("allowed"), blocked: t("blocked"), settings: t("openSettings") }}
        />
      ))}
      {APP_PERMISSIONS.some((key) => states[key] === "denied") ? (
        <p className="mt-2 text-[0.6875rem] leading-snug text-ink-muted">{t("appBlockedHint")}</p>
      ) : null}
    </PermissionsCard>
  );
}

function laterFor(setOpen: (open: boolean) => void) {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Without storage the card comes back next visit, which is acceptable.
  }
  setOpen(false);
}

function PermissionsCard({
  title,
  text,
  onLater,
  laterLabel,
  children,
}: {
  title: string;
  text: string;
  onLater: () => void;
  laterLabel: string;
  children: React.ReactNode;
}) {
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
            {title}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">{text}</p>
        </div>
        <button type="button" onClick={onLater} className="-m-1 rounded-md p-1 text-ink-muted hover:bg-surface-muted hover:text-ink" aria-label={laterLabel}>
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <ul className="mt-3 space-y-2">{children}</ul>
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={onLater} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-surface-muted hover:text-ink">
          {laterLabel}
        </button>
      </div>
    </aside>
  );
}

/**
 * The two questions a signed-in person is asked once in a browser: may the
 * portal tell you about a message when it is closed, and may the chat send
 * where you are.
 *
 * Asked by the portal, in its own words, before the browser asks in its own —
 * a bare browser prompt on arrival is the one people refuse by reflex, and a
 * refusal there cannot be taken back from a web page. Each button is the tap
 * the browser needs; "later" puts the card away for a week. Nothing is asked
 * that the device cannot do.
 */
function BrowserPermissions({ locale, userId }: { locale: string; userId: string }) {
  const t = useTranslations("common.permissions");
  const [push, setPush] = useState<PushState>("unsupported");
  const [geo, setGeo] = useState<GeoState>("unsupported");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"push" | "geo" | null>(null);

  const [native, setNative] = useState<Awaited<ReturnType<typeof nativePush>>>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // In an app built before the permissions plugin, notifications still
      // come from Firebase; the question and the card are the same.
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

  const words = { allow: t("allow"), allowed: t("allowed"), blocked: t("blocked"), settings: t("openSettings") };
  return (
    <PermissionsCard title={t("title")} text={t("text")} onLater={() => laterFor(setOpen)} laterLabel={t("later")}>
      {push !== "unsupported" ? (
        <PermissionRow
          icon={<Bell className="size-4" aria-hidden />}
          label={t("notifications")}
          hint={t("notificationsHint")}
          state={push === "default" ? "ask" : push === "granted" ? "on" : "blocked"}
          busy={busy === "push"}
          onAsk={askPush}
          words={words}
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
          words={words}
        />
      ) : null}
      {push === "denied" || geo === "denied" ? <p className="mt-2 text-[0.6875rem] leading-snug text-ink-muted">{t("blockedHint")}</p> : null}
    </PermissionsCard>
  );
}

function PermissionRow({
  icon,
  label,
  hint,
  state,
  busy,
  onAsk,
  onSettings,
  words,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  state: "ask" | "on" | "blocked" | "settings";
  busy: boolean;
  onAsk: () => void;
  onSettings?: () => void;
  words: { allow: string; allowed: string; blocked: string; settings: string };
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
      ) : state === "settings" && onSettings ? (
        <button
          type="button"
          onClick={onSettings}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface"
        >
          <Settings className="size-3.5" aria-hidden />
          {words.settings}
        </button>
      ) : (
        <span className="shrink-0 text-xs font-medium text-ink-muted">{words.blocked}</span>
      )}
    </li>
  );
}
