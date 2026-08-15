"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  sendResetOtpAction,
  verifyResetOtpAction,
  updatePasswordAction,
  type ResetState,
} from "./actions";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";

export function ResetForm() {
  const t = useTranslations("auth");

  const [state, formAction, isPending] = useActionState(
    (prevState: ResetState, formData: FormData) => {
      if (prevState.step === "email") return sendResetOtpAction(prevState, formData);
      if (prevState.step === "otp") return verifyResetOtpAction(prevState, formData);
      if (prevState.step === "new-password") return updatePasswordAction(prevState, formData);
      return prevState;
    },
    { step: "email", email: null, error: null } as ResetState
  );

  return (
    <div className="w-full max-w-sm space-y-6 animate-in">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50">
          {state.step === "otp" ? (
            <ShieldCheck className="h-6 w-6 text-primary-600" />
          ) : state.step === "new-password" ? (
            <KeyRound className="h-6 w-6 text-primary-600" />
          ) : (
            <Mail className="h-6 w-6 text-primary-600" />
          )}
        </div>
        <h1 className="text-2xl font-bold text-neutral-900">{t("resetTitle")}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {state.step === "email" && t("resetEmailStep")}
          {state.step === "otp" && t("resetOtpStep")}
          {state.step === "new-password" && t("resetNewPasswordStep")}
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        {state.step === "email" && (
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-neutral-700">
              {t("email")}
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="email@example.com"
              required
              autoComplete="email"
              error={!!state.error}
            />
          </div>
        )}

        {state.step === "otp" && (
          <div className="space-y-2">
            <p className="text-center text-sm text-neutral-600">
              {t("otpSentTo", { email: state.email ?? "" })}
            </p>
            <label htmlFor="token" className="text-sm font-medium text-neutral-700">
              {t("otpCode")}
            </label>
            <Input
              id="token"
              name="token"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
              autoComplete="one-time-code"
              className="text-center font-mono text-2xl tracking-[0.5em]"
              error={!!state.error}
            />
          </div>
        )}

        {state.step === "new-password" && (
          <>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-neutral-700">
                {t("newPassword")}
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                error={!!state.error}
              />
              <p className="text-xs text-neutral-500">{t("passwordHint")}</p>
            </div>
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-neutral-700">
                {t("confirmPassword")}
              </label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                error={!!state.error}
              />
            </div>
          </>
        )}

        {state.error && (
          <div className="animate-in rounded-lg bg-red-50 p-3 text-sm text-error-600">
            {t(state.error)}
          </div>
        )}

        <Button type="submit" className="w-full press-scale" loading={isPending}>
          {state.step === "email" && t("sendResetCode")}
          {state.step === "otp" && t("verifyOtp")}
          {state.step === "new-password" && t("updatePassword")}
        </Button>
      </form>

      <p className="text-center text-sm text-neutral-500">
        <Link href="/login" className="font-medium text-primary-600 hover:text-primary-700">
          {t("backToLogin")}
        </Link>
      </p>
    </div>
  );
}
