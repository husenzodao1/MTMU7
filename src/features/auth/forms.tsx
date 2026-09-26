"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment, useRef, useState } from "react";
import { ActionForm, SubmitButton, useFieldError, useFieldValue } from "@/components/ui/action-form";
import { describedBy, FormField } from "@/components/ui/form-controls";
import { AuthMark } from "@/features/auth/auth-mark";
import { GoogleSignInButton } from "@/features/auth/google-button";
import { TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
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
      {/* Google is a way into the account the school issued, matched by
          address — never a way to make one. */}
      <div className="flex items-center gap-3 text-xs text-ink-muted" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        {t("or")}
        <span className="h-px flex-1 bg-line" />
      </div>
      <GoogleSignInButton label={t("google")} next={next} />
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

/** What the sign-in email sends; the boxes drawn before anything is typed. */
const CODE_LENGTH = 6;
/** What the field takes: see the note on maxLength below. */
const CODE_MAX = 10;

/**
 * The code, one digit to a box.
 *
 * Six boxes, but one input: a single transparent field lies over them and
 * takes every keystroke, so a paste, the phone offering the code from the
 * email, Backspace and the numeric keypad all behave as they do in any field,
 * and the form posts one `token` exactly as before. The boxes only draw it.
 *
 * Reaching six digits sends the form, the way a phone's own code screens do.
 */
function CodeField() {
  const t = useTranslations("auth.verify");
  const error = useFieldError("token");
  const submitted = useFieldValue("token");
  const [value, setValue] = useState(() => (submitted ?? "").replace(/\D/g, "").slice(0, CODE_MAX));
  const [focused, setFocused] = useState(false);
  const sentFor = useRef<string | null>(null);
  const id = "f-token";

  // Six is what the project should be set to send and what the hint
  // promises. More boxes appear if more is typed: a project set to eight would
  // otherwise let somebody paste their code, silently keep the first six, and
  // refuse them for ever with no way to tell why.
  const slots = Math.max(CODE_LENGTH, value.length);
  const active = focused && value.length < slots ? value.length : -1;
  const complete = value.length >= CODE_LENGTH;

  return (
    <FormField label={t("code")} htmlFor={id} hint={t("codeHint")} error={error} required>
      <div className={cn("otp relative", complete && "otp-complete")} data-invalid={error ? "" : undefined}>
        <input
          id={id}
          name="token"
          value={value}
          onChange={(event) => {
            const next = event.target.value.replace(/\D/g, "").slice(0, CODE_MAX);
            setValue(next);
            if (next.length === CODE_LENGTH && sentFor.current !== next) {
              sentFor.current = next;
              const form = event.target.form;
              // After this render, so the sixth box is drawn before the page moves on.
              requestAnimationFrame(() => form?.requestSubmit());
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          // The caret stays at the end: the boxes show one place to type, and
          // a caret hidden in the middle would type somewhere else.
          onSelect={(event) => {
            const input = event.currentTarget;
            const end = input.value.length;
            if (input.selectionStart !== end || input.selectionEnd !== end) input.setSelectionRange(end, end);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={CODE_MAX}
          required
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="none"
          {...describedBy(id, { hint: t("codeHint"), error })}
          className="otp-input absolute inset-0 z-10 size-full cursor-text"
        />
        <div className="flex items-center justify-center gap-1.5 sm:gap-2" aria-hidden>
          {Array.from({ length: slots }, (_, index) => (
            <Fragment key={index}>
              {slots === CODE_LENGTH && index === CODE_LENGTH / 2 ? <span className="otp-dot" /> : null}
              <span className={cn("otp-box", index < value.length && "otp-box-filled", index === active && "otp-box-active")}>
                {value[index] ? (
                  <span key={`${index}:${value[index]}`} className="otp-digit">
                    {value[index]}
                  </span>
                ) : null}
              </span>
            </Fragment>
          ))}
        </div>
      </div>
    </FormField>
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
