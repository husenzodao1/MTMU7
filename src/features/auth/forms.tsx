"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { AuthMark } from "@/features/auth/auth-mark";
import { TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";
import {
  confirmEmailAction,
  requestPasswordResetAction,
  sendConfirmationCodeAction,
  setNewPasswordAction,
  signInAction,
  verifyPasswordResetAction,
} from "@/features/auth/actions";

export function SignInForm({ next, markUrl }: { next?: string; markUrl?: string | null }) {
  const t = useTranslations("auth.login");
  const terms = useTranslations("auth.terms");
  return (
    <ActionForm
      action={signInAction}
      className="space-y-4"
      lead={
        <div className="mb-5">
          <AuthMark alt={t("markAlt")} src={markUrl} />
          <h1 className="text-center text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-center text-sm text-ink-secondary">{t("subtitle")}</p>
        </div>
      }
    >
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {/* The school issues the login, but a pupil remembers their nickname and
          the people who set the school up know their address. All three reach
          the same account, so the field takes whichever they have to hand — and
          capitalises nothing, because a nickname is not a serial number. */}
      <TextField name="login" label={t("login")} hint={t("loginHint")} autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} />
      <TextField name="password" type="password" label={t("password")} autoComplete="current-password" required />
      <div className="flex items-center justify-end">
        <Link href="/reset-password" className="text-sm font-medium text-brand-text hover:underline">
          {t("forgot")}
        </Link>
      </div>
      <SubmitButton className="w-full" size="lg">
        {t("submit")}
      </SubmitButton>
      {/* Consent is given by the act of signing in, so there is no checkbox to
          tick; the sentence states what that act means, including for minors. */}
      <p className="text-center text-xs leading-relaxed text-ink-muted">
        {terms.rich("signIn", {
          terms: (chunks) => (
            <Link href="/terms" className="underline underline-offset-2 hover:text-ink-secondary">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </ActionForm>
  );
}

function PasswordFields({ optional = false }: { optional?: boolean }) {
  const t = useTranslations("auth.password");
  return (
    <>
      <TextField
        name="password"
        type="password"
        label={optional ? t("newOptional") : t("new")}
        hint={optional ? t("keepCurrent") : t("rules")}
        autoComplete="new-password"
        required={!optional}
        minLength={10}
      />
      <TextField name="confirmPassword" type="password" label={t("confirm")} autoComplete="new-password" required={!optional} />
    </>
  );
}

function CodeField() {
  const t = useTranslations("auth.verify");
  return (
    <TextField
      name="token"
      label={t("code")}
      hint={t("codeHint")}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={6}
      required
      className="[&_input]:text-lg [&_input]:tracking-[0.3em]"
    />
  );
}

export function VerifyCodeForm() {
  const t = useTranslations("auth.verify");
  return (
    <div className="space-y-4">
      <ActionForm action={verifyPasswordResetAction} className="space-y-4">
        <CodeField />
        <SubmitButton className="w-full" size="lg">
          {t("submit")}
        </SubmitButton>
      </ActionForm>
      <p className="text-center">
        <Button asChild variant="link">
          <Link href="/reset-password">{t("changeEmail")}</Link>
        </Button>
      </p>
    </div>
  );
}

/**
 * The one step between being handed a login and being inside: showing that the
 * address the school wrote down is one this person can actually read.
 */
export function ConfirmEmailForm({ next, email }: { next?: string; email: string }) {
  const t = useTranslations("auth.confirm");
  const tv = useTranslations("auth.verify");
  return (
    <div className="space-y-4">
      <ActionForm
        action={confirmEmailAction}
        className="space-y-4"
        lead={
          <div className="mb-5">
            <h1 className="text-center text-2xl font-semibold">{t("title")}</h1>
            <p className="mt-1 text-center text-sm text-ink-secondary">{t("subtitle", { email })}</p>
          </div>
        }
      >
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <CodeField />
        <SubmitButton className="w-full" size="lg">
          {tv("submit")}
        </SubmitButton>
      </ActionForm>
      <ActionForm action={sendConfirmationCodeAction} className="text-center">
        <SubmitButton variant="link">{tv("resend")}</SubmitButton>
      </ActionForm>
      <p className="text-center text-xs leading-relaxed text-ink-muted">{t("wrongAddress")}</p>
    </div>
  );
}

export function ResetRequestForm() {
  const t = useTranslations("auth.reset");
  return (
    <ActionForm action={requestPasswordResetAction} className="space-y-4">
      <TextField name="email" type="email" label={t("email")} autoComplete="email" inputMode="email" required />
      <SubmitButton className="w-full" size="lg">
        {t("sendCode")}
      </SubmitButton>
    </ActionForm>
  );
}

export function NewPasswordForm() {
  const t = useTranslations("auth.reset");
  return (
    <ActionForm action={setNewPasswordAction} className="space-y-4">
      <PasswordFields />
      <SubmitButton className="w-full" size="lg">
        {t("save")}
      </SubmitButton>
    </ActionForm>
  );
}
