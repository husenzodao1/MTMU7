"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  sendResetOtpAction,
  verifyResetOtpAction,
  updatePasswordAction,
  type ResetState,
} from "./actions";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";

const STEPS = ["email", "otp", "new-password"] as const;

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

  const stepIndex = STEPS.indexOf(state.step as typeof STEPS[number]);

  const icon = state.step === "otp" ? (
    <ShieldCheck className="h-5 w-5 text-white" />
  ) : state.step === "new-password" ? (
    <KeyRound className="h-5 w-5 text-white" />
  ) : (
    <Mail className="h-5 w-5 text-white" />
  );

  const subtitle = state.step === "email"
    ? t("resetEmailStep")
    : state.step === "otp"
    ? t("resetOtpStep")
    : t("resetNewPasswordStep");

  return (
    <Card className="w-full rounded-[28px] border border-neutral-200/80 bg-white/90 shadow-xl backdrop-blur-md animate-in">
      <CardHeader className="text-center pb-2 pt-8">
        {/* Icon */}
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900 text-white text-sm font-black shadow-md">
          {icon}
        </div>

        {/* Step dots */}
        <div className="mx-auto mb-3 flex items-center gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i <= stepIndex
                  ? "h-2 w-6 bg-neutral-900"
                  : "h-2 w-2 bg-neutral-200"
              }`}
            />
          ))}
        </div>

        <CardTitle className="text-xl font-extrabold tracking-tight text-neutral-900">
          {t("resetTitle")}
        </CardTitle>
        <CardDescription className="text-sm text-neutral-500">{subtitle}</CardDescription>
      </CardHeader>

      <CardContent className="pt-2 pb-8">
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
            <div className="space-y-3">
              <p className="text-center text-sm text-neutral-500 rounded-xl bg-neutral-50 py-2 px-3">
                {t("otpSentTo", { email: state.email ?? "" })}
              </p>
              <div className="space-y-2">
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
                <p className="text-xs text-neutral-400">{t("passwordHint")}</p>
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
            <div className="animate-in rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-error-600">
              {t(state.error)}
            </div>
          )}

          <Button type="submit" className="w-full" loading={isPending}>
            {state.step === "email" && t("sendResetCode")}
            {state.step === "otp" && t("verifyOtp")}
            {state.step === "new-password" && t("updatePassword")}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-neutral-500">
          <Link href="/login" className="font-medium text-primary-600 hover:text-primary-700">
            {t("backToLogin")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
