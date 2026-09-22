"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { pickText, type Locale } from "@/lib/i18n/text";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { AuthMark } from "@/features/auth/auth-mark";
import { PhoneField } from "@/features/auth/phone-field";
import { SelectField, TextField } from "@/components/ui/fields";
import { Radio } from "@/components/ui/form-controls";
import { FieldError } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";
import {
  completeProfileAction,
  completeRegistrationAction,
  loadRegistrationOptions,
  requestPasswordResetAction,
  resendRegistrationCodeAction,
  setNewPasswordAction,
  signInAction,
  startRegistrationAction,
  verifyPasswordResetAction,
  verifyRegistrationCodeAction,
  type RegistrationOptions,
} from "@/features/auth/actions";

export function SignInForm({ next }: { next?: string }) {
  const t = useTranslations("auth.login");
  const terms = useTranslations("auth.terms");
  return (
    <ActionForm
      action={signInAction}
      className="space-y-4"
      lead={
        <div className="mb-5">
          <AuthMark alt={t("markAlt")} />
          <h1 className="text-center text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-center text-sm text-ink-secondary">{t("subtitle")}</p>
        </div>
      }
    >
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <TextField name="email" type="email" label={t("email")} autoComplete="email" inputMode="email" required />
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

export function RegistrationDetailsForm({
  schools,
  mode,
  email,
}: {
  schools: Array<{ slug: string; name: string; registrationOpen: boolean }>;
  mode: "start" | "profile";
  email?: string;
}) {
  const t = useTranslations("auth.register");
  const tc = useTranslations();
  const terms = useTranslations("auth.terms");
  const [schoolSlug, setSchoolSlug] = useState(schools.length === 1 ? schools[0]!.slug : "");
  const [options, setOptions] = useState<RegistrationOptions | null>(null);
  const [role, setRole] = useState("");
  const [withCode, setWithCode] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!schoolSlug) return;
    startTransition(async () => {
      setOptions(await loadRegistrationOptions(schoolSlug));
      setRole("");
    });
  }, [schoolSlug]);

  const locale = useLocale() as Locale;
  const localizedRole = (r: RegistrationOptions["roles"][number]) =>
    pickText({ tg: r.name_tg, ru: r.name_ru, en: r.name_en }, locale);

  return (
    <ActionForm action={mode === "start" ? startRegistrationAction : completeProfileAction} className="space-y-5">
      <SelectField
        name="schoolSlug"
        label={t("school")}
        required
        value={schoolSlug}
        onChange={(e) => setSchoolSlug(e.target.value)}
        placeholder={t("selectSchool")}
        options={schools.map((s) => ({ value: s.slug, label: s.name }))}
      />

      <div className="rounded-lg border border-line p-4">
        <label className="flex items-center gap-3 text-sm font-medium text-ink">
          <input type="checkbox" className="size-4 accent-brand-600" checked={withCode} onChange={(e) => setWithCode(e.target.checked)} />
          {t("haveCode")}
        </label>
        {withCode ? (
          <TextField className="mt-3" name="invitationCode" label={t("code")} hint={t("codeHint")} autoComplete="off" maxLength={16} />
        ) : null}
      </div>

      {!withCode ? (
        <fieldset className="space-y-2" aria-busy={pending}>
          <legend className="text-sm font-medium text-ink">
            {t("role")} <span className="text-danger-600" aria-hidden>*</span>
          </legend>
          {options && !options.registrationOpen ? <p className="text-sm text-warning-700">{tc("errors.registration_closed")}</p> : null}
          {options?.roles.length ? (
            <div className="grid gap-1">
              {options.roles.map((r) => (
                <Radio key={r.slug} name="roleSlug" value={r.slug} label={localizedRole(r)} checked={role === r.slug} onChange={() => setRole(r.slug)} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">{schoolSlug ? tc("common.loading") : t("selectSchoolFirst")}</p>
          )}
          <FieldError name="roleSlug" />
        </fieldset>
      ) : null}

      {!withCode && role === "student" && options ? (
        <SelectField
          name="classId"
          label={t("class")}
          placeholder={t("selectClass")}
          hint={t("classHint")}
          options={options.classes.map((c) => ({ value: c.id, label: c.name }))}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="lastName" label={t("lastName")} autoComplete="family-name" required maxLength={100} />
        <TextField name="firstName" label={t("firstName")} autoComplete="given-name" required maxLength={100} />
      </div>
      <TextField name="middleName" label={t("middleName")} autoComplete="additional-name" maxLength={100} />
      <PhoneField label={t("phone")} invalidMessage={t("phoneInvalid")} />

      {mode === "start" ? (
        <TextField name="email" type="email" label={t("email")} hint={t("emailHint")} autoComplete="email" inputMode="email" required />
      ) : (
        <>
          <p className="text-sm text-ink-secondary">{t("signedInAs", { email: email ?? "" })}</p>
          <PasswordFields optional />
        </>
      )}

      <SubmitButton className="w-full" size="lg">
        {mode === "start" ? t("sendCode") : t("finish")}
      </SubmitButton>
      <p className="text-center text-xs leading-relaxed text-ink-muted">
        {terms.rich("register", {
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

export function VerifyCodeForm({ purpose }: { purpose: "register" | "reset" }) {
  const t = useTranslations("auth.verify");
  const action = purpose === "register" ? verifyRegistrationCodeAction : verifyPasswordResetAction;
  return (
    <div className="space-y-4">
      <ActionForm action={action} className="space-y-4">
        <TextField
          name="token"
          label={t("code")}
          hint={t("codeHint")}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={10}
          required
          className="[&_input]:text-lg [&_input]:tracking-[0.3em]"
        />
        <SubmitButton className="w-full" size="lg">
          {t("submit")}
        </SubmitButton>
      </ActionForm>
      {purpose === "register" ? (
        <ActionForm action={resendRegistrationCodeAction} className="text-center">
          <SubmitButton variant="link">{t("resend")}</SubmitButton>
        </ActionForm>
      ) : (
        <p className="text-center">
          <Button asChild variant="link">
            <Link href="/reset-password">{t("changeEmail")}</Link>
          </Button>
        </p>
      )}
    </div>
  );
}

export function RegistrationPasswordForm() {
  const t = useTranslations("auth.register");
  return (
    <ActionForm action={completeRegistrationAction} className="space-y-4">
      <PasswordFields />
      <SubmitButton className="w-full" size="lg">
        {t("finish")}
      </SubmitButton>
    </ActionForm>
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
