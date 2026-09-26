"use client";

import { Check, Copy, ShieldCheck, ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { CodeField } from "@/features/auth/forms";
import { confirmTwoFactorAction, disableTwoFactorAction, startTwoFactorAction, type Enrolment } from "@/features/auth/two-factor-actions";
import { cn } from "@/lib/utils/cn";

/**
 * Turning the second step on and off, from settings.
 *
 * On: a QR code for the authenticator app (and the key, for typing in), then
 * the first code the app shows — which proves the app was set up before the
 * lock is fitted. Off: the current code, so an unattended session cannot
 * quietly take the lock away.
 */
export function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  const t = useTranslations("portal.settings.twoFactor");
  const tRoot = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [copied, setCopied] = useState(false);

  const codeOf = (event: FormEvent<HTMLFormElement>) => String(new FormData(event.currentTarget).get("token") ?? "");

  const start = () =>
    startTransition(async () => {
      const result = await startTwoFactorAction();
      if (!result.ok || !result.data) return toast("danger", tRoot(result.message ?? "errors.unexpected"));
      setEnrolment(result.data);
    });

  const confirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!enrolment) return;
    const token = codeOf(event);
    startTransition(async () => {
      const result = await confirmTwoFactorAction(enrolment.factorId, token);
      if (!result.ok) return toast("danger", tRoot(result.message));
      toast("success", t("enabled"));
      setEnrolment(null);
      router.refresh();
    });
  };

  const disable = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = codeOf(event);
    startTransition(async () => {
      const result = await disableTwoFactorAction(token);
      if (!result.ok) return toast("danger", tRoot(result.message));
      toast("success", t("disabled"));
      setDisabling(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className={cn("inline-flex size-11 items-center justify-center rounded-2xl", enabled ? "bg-success-50 text-success-600" : "bg-surface-muted text-ink-muted")}>
          {enabled ? <ShieldCheck className="size-6" aria-hidden /> : <ShieldOff className="size-6" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{enabled ? t("on") : t("off")}</p>
        </div>
        {!enabled && !enrolment ? (
          <Button onClick={start} loading={pending}>
            {t("enable")}
          </Button>
        ) : null}
        {enabled && !disabling ? (
          <Button variant="secondary" onClick={() => setDisabling(true)}>
            {t("disable")}
          </Button>
        ) : null}
      </div>

      {enrolment ? (
        <form onSubmit={confirm} className="space-y-4 rounded-2xl border border-line bg-surface-muted/50 p-4">
          <p className="text-sm font-medium text-ink">{t("scan")}</p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- an SVG data URL made by Supabase for this enrolment */}
            <img src={enrolment.qr} alt="" width={176} height={176} className="size-44 shrink-0 rounded-xl bg-white p-2 shadow-xs" />
            <div className="min-w-0 space-y-1.5 text-center sm:text-start">
              <p className="text-xs text-ink-muted">{t("manual")}</p>
              <p className="break-all font-mono text-sm font-semibold tracking-wider text-ink">{enrolment.secret}</p>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(enrolment.secret);
                  setCopied(true);
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-text hover:underline"
              >
                {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                {t("copy")}
              </button>
            </div>
          </div>
          <p className="text-sm font-medium text-ink">{t("enterCode")}</p>
          <CodeField label={t("enterCode")} hint={tRoot("auth.twoFactor.codeHint")} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEnrolment(null)}>
              {t("cancel")}
            </Button>
            <Button type="submit" loading={pending}>
              {t("confirm")}
            </Button>
          </div>
        </form>
      ) : null}

      {disabling ? (
        <form onSubmit={disable} className="space-y-4 rounded-2xl border border-line bg-surface-muted/50 p-4">
          <p className="text-sm text-ink-secondary">{t("disableHint")}</p>
          <CodeField label={tRoot("auth.twoFactor.code")} hint={tRoot("auth.twoFactor.codeHint")} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDisabling(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="danger" loading={pending}>
              {t("disable")}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
