"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  sendOtpAction,
  verifyOtpAction,
  completeRegistrationAction,
  type RegistrationState,
} from "./actions";
import { Mail, KeyRound, UserPlus } from "lucide-react";
import Link from "next/link";

const initialState: RegistrationState = {
  step: "email",
  email: null,
  error: null,
};

export function RegisterForm() {
  const t = useTranslations("auth");
  const [state, formAction, isPending] = useActionState(
    (prevState: RegistrationState, formData: FormData) => {
      switch (prevState.step) {
        case "email":
          return sendOtpAction(prevState, formData);
        case "otp":
          return verifyOtpAction(prevState, formData);
        case "complete":
          return completeRegistrationAction(prevState, formData);
      }
    },
    initialState
  );

  return (
    <div className="w-full max-w-sm space-y-6 animate-in">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50">
          {state.step === "email" && <Mail className="h-6 w-6 text-primary-600" />}
          {state.step === "otp" && <KeyRound className="h-6 w-6 text-primary-600" />}
          {state.step === "complete" && <UserPlus className="h-6 w-6 text-primary-600" />}
        </div>
        <h1 className="text-2xl font-bold text-neutral-900">{t("registerTitle")}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {state.step === "email" && t("registerEmailStep")}
          {state.step === "otp" && t("registerOtpStep")}
          {state.step === "complete" && t("registerCompleteStep")}
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
            <label htmlFor="token" className="text-sm font-medium text-neutral-700">
              {t("otpCode")}
            </label>
            <Input
              id="token"
              name="token"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              required
              autoComplete="one-time-code"
              error={!!state.error}
              className="text-center text-2xl tracking-[0.5em] font-mono"
            />
            <p className="text-xs text-neutral-500">{t("otpSentTo", { email: state.email ?? "" })}</p>
          </div>
        )}

        {state.step === "complete" && (
          <>
            <div className="space-y-2">
              <label htmlFor="invitationCode" className="text-sm font-medium text-neutral-700">
                {t("invitationCode")}
              </label>
              <Input
                id="invitationCode"
                name="invitationCode"
                type="text"
                placeholder="ABCD1234"
                required
                maxLength={10}
                className="text-center font-mono uppercase tracking-wider"
                error={!!state.error}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label htmlFor="firstName" className="text-sm font-medium text-neutral-700">
                  {t("firstName")}
                </label>
                <Input id="firstName" name="firstName" required error={!!state.error} />
              </div>
              <div className="space-y-2">
                <label htmlFor="lastName" className="text-sm font-medium text-neutral-700">
                  {t("lastName")}
                </label>
                <Input id="lastName" name="lastName" required error={!!state.error} />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="middleName" className="text-sm font-medium text-neutral-700">
                {t("middleName")}
              </label>
              <Input id="middleName" name="middleName" error={!!state.error} />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-neutral-700">
                {t("password")}
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
          </>
        )}

        {state.error && (
          <div className="animate-in rounded-lg bg-red-50 p-3 text-sm text-error-600">
            {t(state.error)}
          </div>
        )}

        <Button type="submit" className="w-full press-scale" loading={isPending}>
          {state.step === "email" && t("sendOtp")}
          {state.step === "otp" && t("verifyOtp")}
          {state.step === "complete" && t("registerButton")}
        </Button>
      </form>

      <p className="text-center text-sm text-neutral-500">
        {t("hasAccount")}{" "}
        <Link href="/login" className="font-medium text-primary-600 hover:text-primary-700">
          {t("loginButton")}
        </Link>
      </p>
    </div>
  );
}
