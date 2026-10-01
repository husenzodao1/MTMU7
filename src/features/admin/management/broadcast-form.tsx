"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ActionForm, SubmitButton, useFieldError } from "@/components/ui/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { Checkbox, Radio } from "@/components/ui/form-controls";
import { saveBroadcastAction } from "@/features/admin/management/actions";

function GroupError({ name }: { name: string }) {
  const error = useFieldError(name);
  return error ? <p className="text-sm font-medium text-danger-700" role="alert">{error}</p> : null;
}

export function BroadcastForm({ roles, classes }: { roles: Array<{ value: string; label: string }>; classes: Array<{ value: string; label: string }> }) {
  const t = useTranslations("admin.broadcasts");
  const ta = useTranslations("admin.announcements.audiences");
  const [audience, setAudience] = useState("school");
  const [when, setWhen] = useState("now");
  return (
    <ActionForm action={saveBroadcastAction} className="space-y-4" resetOnSuccess>
      <TextField name="title" label={t("titleField")} required maxLength={200} />
      <TextAreaField name="body" label={t("body")} rows={3} maxLength={1000} />
      <TextField name="linkUrl" label={t("link")} hint={t("linkHint")} maxLength={500} placeholder="/announcements" />
      <SelectField
        name="audienceType"
        label={t("audience")}
        value={audience}
        onChange={(e) => setAudience(e.target.value)}
        options={(["school", "staff", "students", "parents", "roles", "classes"] as const).map((a) => ({ value: a, label: ta(a) }))}
      />
      {audience === "roles" ? (
        <fieldset>
          <legend className="text-sm font-medium">{t("roles")}</legend>
          <div className="grid grid-cols-2">{roles.map((r) => <Checkbox key={r.value} name="audienceRoles" value={r.value} label={r.label} />)}</div>
          <GroupError name="audienceRoles" />
        </fieldset>
      ) : null}
      {audience === "classes" ? (
        <fieldset>
          <legend className="text-sm font-medium">{t("classes")}</legend>
          <div className="grid max-h-48 grid-cols-3 overflow-y-auto">{classes.map((c) => <Checkbox key={c.value} name="audienceClassIds" value={c.value} label={c.label} />)}</div>
          <GroupError name="audienceClassIds" />
        </fieldset>
      ) : null}
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">{t("when")}</legend>
        <Radio name="when" value="now" checked={when === "now"} onChange={() => setWhen("now")} label={t("sendNow")} />
        <Radio name="when" value="schedule" checked={when === "schedule"} onChange={() => setWhen("schedule")} label={t("schedule")} />
      </fieldset>
      {when === "schedule" ? <TextField name="scheduledAt" type="datetime-local" label={t("scheduledAt")} required /> : null}
      <SubmitButton>{when === "now" ? t("sendNow") : t("scheduleSubmit")}</SubmitButton>
    </ActionForm>
  );
}
