"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { report } from "@/features/native/diagnostics";
import { WELCOME_COOKIE } from "@/lib/auth/welcome-cookie";
import { cn } from "@/lib/utils/cn";

/** Set on <html> while the sign-in veil is up, so the welcome carries on from it. */
const VEIL_ATTRIBUTE = "data-signin-veil";

/** The mark the app opens with: the dot that rises, the two leaves of the book. */
function Mark({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <defs>
        <linearGradient id="welcome-dot" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#ffd98a" />
          <stop offset="1" stopColor="#ff9a3c" />
        </linearGradient>
      </defs>
      <circle className="welcome-glow" cx="256" cy="190" r="92" fill="#ffb547" />
      <circle className="welcome-dot" cx="256" cy="190" r="46" fill="url(#welcome-dot)" />
      <path className="welcome-leaf" d="M256 372 C 222 318, 164 296, 98 300" />
      <path className="welcome-leaf" d="M256 372 C 290 318, 348 296, 414 300" />
    </svg>
  );
}

/**
 * The moment between signing in and the portal: the school's mark on the
 * app's night blue, "Welcome" drawing itself in, the person's name in the
 * greeting's hand, a hairline of light — and then the whole veil closes into
 * the dot it started from and the page is simply there.
 *
 * Rendered by the portal's layouts on the first page after a sign-in (the
 * one-minute cookie markWelcome() leaves) and by nothing else, so it is seen
 * once per sign-in and never on an ordinary visit. A tap skips it, and with
 * reduced motion it is a short fade.
 */
export function WelcomeTransition({ firstName }: { firstName: string }) {
  const t = useTranslations("common.welcome");
  const [phase, setPhase] = useState<"on" | "out" | "gone">("on");

  useEffect(() => {
    document.cookie = `${WELCOME_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
    const quick = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const out = window.setTimeout(() => setPhase("out"), quick ? 500 : 1750);
    return () => window.clearTimeout(out);
  }, []);

  useEffect(() => {
    if (phase !== "out") return;
    const gone = window.setTimeout(() => {
      setPhase("gone");
      document.documentElement.removeAttribute(VEIL_ATTRIBUTE);
    }, 650);
    return () => window.clearTimeout(gone);
  }, [phase]);

  if (phase === "gone") return null;
  return (
    <div className={cn("welcome", phase === "out" && "welcome-out")} role="status" onClick={() => setPhase("out")}>
      <div className="welcome-stage">
        <Mark className="welcome-mark" />
        <p className="welcome-kicker">{t("title")}</p>
        {firstName ? <p className="welcome-name">{firstName}</p> : null}
        <span className="welcome-line" aria-hidden />
      </div>
    </div>
  );
}

/**
 * The same night blue over the sign-in form while the portal checks the
 * password: after a quarter of a second, so a quick answer never flickers,
 * and gone again if the answer is no. When the answer is yes, the page that
 * follows opens with WelcomeTransition, which picks up from this very frame.
 */
export function SignInVeil() {
  const t = useTranslations("common.welcome");
  const { pending } = useFormStatus();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!pending) {
      document.documentElement.removeAttribute(VEIL_ATTRIBUTE);
      return;
    }
    report("signin.submit");
    const show = window.setTimeout(() => {
      setShown(true);
      document.documentElement.setAttribute(VEIL_ATTRIBUTE, "");
    }, 250);
    // In the app: a sign-in still waiting after ten seconds is worth knowing about.
    const stuck = window.setTimeout(() => report("signin.stuck", {}, true), 10_000);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(stuck);
      setShown(false);
    };
  }, [pending]);

  if (!pending || !shown) return null;
  return (
    <div className="welcome welcome-veil" role="status" aria-live="polite">
      <div className="welcome-stage">
        <Mark className="welcome-mark" />
        <p className="welcome-kicker">{t("signingIn")}</p>
        {/* The welcome's name and hairline, unseen, so the mark stands exactly
            where it will stand when the welcome takes over. */}
        <p className="welcome-name invisible" aria-hidden>
          &nbsp;
        </p>
        <span className="welcome-line invisible" aria-hidden />
      </div>
    </div>
  );
}
