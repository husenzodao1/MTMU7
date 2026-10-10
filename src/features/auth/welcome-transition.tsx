"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { BookScene } from "@/features/intro/book-scene";
import type { ScriptLine } from "@/features/intro/greeting-paths";
import { INTRO_MS, INTRO_QUICK_MS } from "@/features/intro/intro-script";
import { report } from "@/features/native/diagnostics";
import { WELCOME_COOKIE } from "@/lib/auth/welcome-cookie";
import { cn } from "@/lib/utils/cn";

/** Set on <html> while the sign-in veil is up, so the welcome carries on from it. */
const VEIL_ATTRIBUTE = "data-signin-veil";

/**
 * The moment between signing in and the portal: the same book as the site's
 * opening (book-scene.tsx) — it opens, its pages turn, it rushes into a flash
 * of light — and on the paper "Welcome" writes itself by hand, and the
 * person's name under it.
 *
 * Rendered by the portal's layouts on the first page after a sign-in (the
 * one-minute cookie markWelcome() leaves) and by nothing else, so it is seen
 * once per sign-in and never on an ordinary visit. After the veil the book is
 * already in the middle and does not fly in again. A tap skips it, and with
 * reduced motion it is the greeting, already written, for a moment.
 */
export function WelcomeTransition({ firstName, script }: { firstName: string; script: ScriptLine }) {
  const [phase, setPhase] = useState<"on" | "out" | "gone">("on");

  useEffect(() => {
    document.cookie = `${WELCOME_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
    const quick = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const out = window.setTimeout(() => setPhase("out"), quick ? INTRO_QUICK_MS : INTRO_MS);
    return () => window.clearTimeout(out);
  }, []);

  useEffect(() => {
    if (phase !== "out") return;
    const gone = window.setTimeout(() => {
      setPhase("gone");
      document.documentElement.removeAttribute(VEIL_ATTRIBUTE);
    }, 560);
    return () => window.clearTimeout(gone);
  }, [phase]);

  if (phase === "gone") return null;
  return (
    <div className={cn("intro intro-welcome", phase === "out" && "intro-leaving")} data-play="" role="status" onClick={() => setPhase("out")}>
      <BookScene lines={[script]} name={firstName} />
    </div>
  );
}

/**
 * The same night blue over the sign-in form while the portal checks the
 * password — the book, shut, waiting in the middle: after a quarter of a
 * second, so a quick answer never flickers, and gone again if the answer is
 * no. When the answer is yes, the page that follows opens with
 * WelcomeTransition, whose book starts exactly here.
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
    <div className="intro intro-welcome intro-veil" role="status" aria-live="polite">
      <BookScene closed />
      <p className="intro-veil-label">{t("signingIn")}</p>
    </div>
  );
}
