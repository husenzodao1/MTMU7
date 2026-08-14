"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { sendResetAction, updatePasswordAction, type ResetState } from "./actions";
import { KeyRound, Mail, CheckCircle } from "lucide-react";
import Link from "next/link";

export function ResetForm({ initialStep }: { initialStep: "email" | "new-password" }) {
  const t = useTranslations("auth");

  const [state, formAction, isPending] = useActionState(
    (prevState: ResetState, formData: FormData) => {
      if (prevState.step === "email") return sendResetAction(prevState, formData);
      if (prevState.step === "new-password") return updatePasswordAction(prevState, formData);
      return prevState;
    },
    { step: initialStep, error: null } as ResetState
  );

  return (
    <div className="w-full max-w-sm space-y-6 animate-in">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50">
          {state.step === "sent" ? (
            <CheckCircle className="h-6 w-6 text-success-600" />
          ) : state.step === "new-password" ? (
            <KeyRound className="h-6 w-6 text-primary-600" />
          ) : (
            <Mail className="h-6 w-6 text-primary-600" />
          )}
        </div>
        <h1 className="text-2xl font-bold text-neutral-900">{t("resetTitle")}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {state.step === "email" && t("resetEmailStep")}
          {state.step === "sent" && t("resetSentStep")}
          {state.step === "new-password" && t("resetNewPasswordStep")}
        </p>
      </div>

      {state.step !== "sent" && (
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

          {state.step === "new-password" && (
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
          )}

          {state.error && (
            <div className="animate-in rounded-lg bg-red-50 p-3 text-sm text-error-600">
              {t(state.error)}
            </div>
          )}

          <Button type="submit" className="w-full press-scale" loading={isPending}>
            {state.step === "email" ? t("sendResetLink") : t("updatePassword")}
          </Button>
        </form>
      )}

      <p className="text-center text-sm text-neutral-500">
        <Link href="/login" className="font-medium text-primary-600 hover:text-primary-700">
          {t("backToLogin")}
        </Link>
      </p>
    </div>
  );
}
