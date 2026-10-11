"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { IntroScene, SCHOOL_MARK } from "@/features/intro/intro-scene";
import { INTRO_QUICK_MS, WELCOME_MS } from "@/features/intro/intro-script";
import { report } from "@/features/native/diagnostics";
import { WELCOME_COOKIE } from "@/lib/auth/welcome-cookie";
import { cn } from "@/lib/utils/cn";

/** Set on <html> while the sign-in veil is up, so the welcome carries on from it. */
const VEIL_ATTRIBUTE = "data-signin-veil";

/**
 * The moment between signing in and the portal: on the same night canvas as
 * the sign-in veil, "Салом" is written out and the person's name follows in
 * brass (intro-scene.tsx), in about two seconds (WELCOME_MS) while the portal
 * loads underneath. A tap skips it; with reduced motion it is the finished
 * greeting for a moment.
 *
 * Rendered by the portal's layouts on the first page after a sign-in (the
 * one-minute cookie markWelcome() leaves) and by nothing else.
 */
export function WelcomeTransition({ firstName }: { firstName: string }) {
  const t = useTranslations("common.welcome");
  const [phase, setPhase] = useState<"on" | "out" | "gone">("on");

  useEffect(() => {
    document.cookie = `${WELCOME_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
    const quick = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const out = window.setTimeout(() => setPhase("out"), quick ? INTRO_QUICK_MS : WELCOME_MS);
    return () => window.clearTimeout(out);
  }, []);

  useEffect(() => {
    if (phase !== "out") return;
    const gone = window.setTimeout(() => {
      setPhase("gone");
      document.documentElement.removeAttribute(VEIL_ATTRIBUTE);
    }, 400);
    return () => window.clearTimeout(gone);
  }, [phase]);

  if (phase === "gone") return null;
  return (
    <div className={cn("intro intro-welcome", phase === "out" && "intro-leaving")} data-play="" role="status" onClick={() => setPhase("out")}>
      <IntroScene words={t("hello")} name={firstName} />
    </div>
  );
}

/**
 * The same night canvas over the sign-in form while the portal checks the
 * password — the mark and a thin brass line running for as long as the answer
 * takes: after a quarter of a second, so a quick answer never flickers, and
 * gone again if the answer is no. When the answer is yes, the page that
 * follows opens with WelcomeTransition on the same canvas.
 */
export function SignInVeil() {
  const t = useTranslations("common.welcome");
  const { pending } = useFormStatus();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!pending) {
      document.documentElement.removeAttribute(VEIL_ATTRIBUTE);
      // Arrived from signing out: the dimmed portal is gone.
      document.documentElement.removeAttribute("data-leaving");
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
    <div className="intro intro-welcome intro-veil" role="status" aria-live="polite">
      <div className="intro-writing">
        <span className="intro-mark" aria-hidden>
          {SCHOOL_MARK}
        </span>
        <span className="intro-progress" aria-hidden />
        <p className="intro-veil-label">{t("signingIn")}</p>
      </div>
    </div>
  );
}
