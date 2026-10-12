"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { BookScene } from "@/features/intro/book-scene";
import { WELCOME_MS } from "@/features/intro/intro-script";
import { report } from "@/features/native/diagnostics";
import { WELCOME_COOKIE } from "@/lib/auth/welcome-cookie";
import { cn } from "@/lib/utils/cn";

/** Set on <html> while the sign-in veil is up, so the welcome carries on from it. */
const VEIL_ATTRIBUTE = "data-signin-veil";

/**
 * The moment between signing in and the portal: the book that floated shut
 * while the password was checked opens, a light comes up out of its pages and
 * "Салом, <name>!" writes itself under it in a light hand over a thin
 * ornament (book-scene.tsx), in three seconds (WELCOME_MS) while the portal
 * loads underneath. A tap skips it.
 *
 * Rendered by the portal's layouts on the first page after a sign-in (the
 * one-minute cookie markWelcome() leaves) and by nothing else.
 */
export function WelcomeTransition({ firstName }: { firstName: string }) {
  const t = useTranslations("common.welcome");
  const [phase, setPhase] = useState<"on" | "out" | "gone">("on");

  useEffect(() => {
    document.cookie = `${WELCOME_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
    const out = window.setTimeout(() => setPhase("out"), WELCOME_MS);
    return () => window.clearTimeout(out);
  }, []);

  useEffect(() => {
    if (phase !== "out") return;
    const gone = window.setTimeout(() => {
      setPhase("gone");
      document.documentElement.removeAttribute(VEIL_ATTRIBUTE);
    }, 450);
    return () => window.clearTimeout(gone);
  }, [phase]);

  if (phase === "gone") return null;
  return (
    <div className={cn("intro intro-welcome", phase === "out" && "intro-leaving")} data-play="" role="status" onClick={() => setPhase("out")}>
      <BookScene hello={t("hello")} name={firstName} />
    </div>
  );
}

/**
 * The same night blue over the sign-in form while the portal checks the
 * password — the book, shut, floating and breathing a little light: after a
 * quarter of a second, so a quick answer never flickers, and gone again if
 * the answer is no. When the answer is yes, the page that follows opens with
 * WelcomeTransition, which carries on from exactly here.
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
      <BookScene hello="" waiting />
      <p className="intro-veil-label">{t("signingIn")}</p>
    </div>
  );
}
