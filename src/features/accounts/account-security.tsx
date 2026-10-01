"use client";

import { KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import * as Overlay from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { resetPasswordAction, resetTwoFactorAction } from "@/features/accounts/actions";
import { CredentialsCard } from "@/features/accounts/credentials-card";
import { cn } from "@/lib/utils/cn";

/**
 * A new password, and the second step switched off for somebody who lost their
 * phone. Both ask once more before they happen: the first signs the person
 * out everywhere, the second takes a lock off their account.
 */
export function AccountSecurity({
  userId,
  name,
  mfa,
  canResetPassword,
  canResetTwoFactor,
  offerTelegram,
}: {
  userId: string;
  name: string;
  mfa: boolean;
  canResetPassword: boolean;
  canResetTwoFactor: boolean;
  offerTelegram: boolean;
}) {
  const t = useTranslations("accounts");
  const tc = useTranslations("common");
  const tRoot = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const [confirming, setConfirming] = useState<"password" | "mfa" | null>(null);
  const [issued, setIssued] = useState<{ login: string; password: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      if (confirming === "password") {
        const result = await resetPasswordAction(userId);
        setConfirming(null);
        if (!result.ok || !result.data?.password) return void toast("danger", tRoot(result.ok ? "errors.unexpected" : result.message));
        setIssued({ login: result.data.login, password: result.data.password });
        toast("success", t("passwordReset"));
      } else if (confirming === "mfa") {
        const result = await resetTwoFactorAction(userId);
        setConfirming(null);
        if (!result.ok) return void toast("danger", tRoot(result.message));
        toast("success", t("twoFactorReset"));
        router.refresh();
      }
    });

  return (
    <div className="space-y-3">
      {issued ? <CredentialsCard name={name} login={issued.login} password={issued.password} offerTelegram={offerTelegram} /> : null}

      <div className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm", mfa ? "border-success-600/30 bg-success-50" : "border-line bg-surface-muted/40")}>
        {mfa ? <ShieldCheck className="size-4.5 shrink-0 text-success-700" aria-hidden /> : <ShieldOff className="size-4.5 shrink-0 text-ink-muted" aria-hidden />}
        <span className="min-w-0 flex-1 font-medium text-ink">{mfa ? t("twoFactorOn") : t("twoFactorOff")}</span>
        {mfa && canResetTwoFactor ? (
          <Button size="sm" variant="danger-outline" onClick={() => setConfirming("mfa")}>
            {t("resetTwoFactor")}
          </Button>
        ) : null}
      </div>

      {canResetPassword ? (
        <Button variant="secondary" className="w-full" onClick={() => setConfirming("password")}>
          <KeyRound aria-hidden />
          {t("resetPassword")}
        </Button>
      ) : null}

      <Overlay.Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <Overlay.DialogContent
          title={confirming === "mfa" ? t("resetTwoFactor") : t("resetPassword")}
          description={confirming === "mfa" ? t("resetTwoFactorHint") : t("resetPasswordHint")}
          closeLabel={tc("close")}
          size="sm"
        >
          <div className="flex justify-end gap-2">
            <Overlay.DialogClose asChild>
              <Button variant="secondary">{tc("cancel")}</Button>
            </Overlay.DialogClose>
            <Button variant={confirming === "mfa" ? "danger" : "primary"} onClick={run} loading={pending}>
              {confirming === "mfa" ? t("resetTwoFactor") : t("resetPassword")}
            </Button>
          </div>
        </Overlay.DialogContent>
      </Overlay.Dialog>
    </div>
  );
}
