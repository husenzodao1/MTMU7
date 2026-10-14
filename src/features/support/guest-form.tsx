"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { TextAreaField, TextField } from "@/components/ui/fields";
import { Alert } from "@/components/ui/surface";
import { submitSupportRequestAction } from "@/features/support/actions";

/** The note a visitor leaves when they cannot sign in to chat. */
export function GuestSupportForm() {
  const t = useTranslations("common.support.guest");
  const [sent, setSent] = useState(false);

  if (sent) {
    return <Alert tone="success">{t("sent")}</Alert>;
  }

  return (
    <ActionForm action={submitSupportRequestAction} className="space-y-3" showSuccessToast={false} onSuccess={() => setSent(true)}>
      <TextField name="name" label={t("name")} autoComplete="name" required maxLength={120} />
      <TextField name="contact" label={t("contact")} hint={t("contactHint")} autoComplete="tel" inputMode="text" required maxLength={160} />
      <TextAreaField name="message" label={t("message")} rows={4} required maxLength={2000} />
      {/* A field no person sees and every form-filling bot fills. */}
      <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
        <label htmlFor="support-website">Website</label>
        <input id="support-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <SubmitButton className="w-full" size="lg">
        {t("send")}
      </SubmitButton>
    </ActionForm>
  );
}
