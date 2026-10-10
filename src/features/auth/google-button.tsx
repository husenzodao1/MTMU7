"use client";

import { useState, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { isInApp, nativeGoogleSignIn, type NativeGoogleResult } from "@/features/native/bridge";
import { report } from "@/features/native/diagnostics";

/**
 * Google's own four-colour "G", drawn at its published proportions. The mark
 * is Google's to define, so it is reproduced rather than approximated with an
 * icon set's letter.
 */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={className}>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Which sentence explains a reason nativeGoogleSignIn gave. */
function problemKey(reason: string): "notReady" | "noAccount" | "network" | "failed" {
  if (reason === "no_bridge" || reason === "not_configured" || reason === "not_accepted") return "notReady";
  if (reason === "no_account") return "noAccount";
  if (reason === "network") return "network";
  return "failed";
}

/**
 * The quiet alternative under the password form: a white pill with Google's
 * mark, as Google asks it to be drawn, and nothing else.
 *
 * A plain link, never next/link. /auth/google answers with a redirect to
 * Google, and a client-side navigation that ends on another site leaves the
 * router waiting for a page that never arrives.
 *
 * In the app the link is not followed at all: the phone's own account sheet
 * is the only way, because Google's page would open in Chrome and nobody has
 * come back from there signed in. When the phone's way cannot be used the
 * button stops spinning and says why, with the reason's code for whoever has
 * to fix it.
 */
export function GoogleSignInButton({ label, next }: { label: string; next?: string }) {
  const t = useTranslations("auth.login.googleApp");
  const href = next ? `/auth/google?next=${encodeURIComponent(next)}` : "/auth/google";
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ key: ReturnType<typeof problemKey>; reason: string } | null>(null);

  async function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!isInApp()) return;
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    let answer: NativeGoogleResult;
    try {
      answer = await nativeGoogleSignIn(next);
    } catch (error) {
      // Whatever happens, the button does not stay spinning.
      answer = { kind: "unavailable", reason: "error", message: String(error).slice(0, 200) };
    }
    report("google.result", { ...answer, path: undefined }, true);
    if (answer.kind === "signed-in") {
      window.location.assign(answer.path);
      return;
    }
    setBusy(false);
    if (answer.kind === "unavailable") setProblem({ key: problemKey(answer.reason), reason: answer.reason });
  }

  return (
    <div>
      <a
        href={href}
        onClick={onClick}
        aria-busy={busy || undefined}
        className="google-button flex h-11 w-full items-center justify-center gap-2.5 rounded-full border px-4 text-sm font-medium shadow-xs transition-colors aria-busy:opacity-70"
      >
        {busy ? <span className="size-[18px] animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : <GoogleMark className="size-[18px]" />}
        <span>{label}</span>
      </a>
      {problem ? (
        <p role="alert" className="mt-2 text-center text-xs leading-relaxed text-ink-secondary">
          {t(problem.key)} <span className="text-ink-muted">({problem.reason})</span>
        </p>
      ) : null}
    </div>
  );
}
