"use client";

import { Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ActionForm, SubmitButton, useFieldError } from "@/components/ui/action-form";
import { DirectUpload } from "@/components/ui/direct-upload";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { Checkbox, Fieldset } from "@/components/ui/form-controls";
import { Markdown } from "@/components/ui/misc";
import { saveAnnouncementAction } from "@/features/admin/content/announcement-actions";

export interface AnnouncementFormValues {
  id: string;
  title: string;
  body: string;
  priority: string;
  audienceType: string;
  audienceRoles: string[];
  audienceClassIds: string[];
  publishAt: string;
  expiresAt: string;
  status: string;
  attachmentName: string | null;
}

function GroupError({ name }: { name: string }) {
  const error = useFieldError(name);
  return error ? <p className="text-sm font-medium text-danger-700" role="alert">{error}</p> : null;
}

export function AnnouncementForm({
  announcement,
  schoolId,
  roles,
  classes,
  canPublish,
}: {
  announcement: AnnouncementFormValues | null;
  schoolId: string;
  roles: Array<{ value: string; label: string }>;
  classes: Array<{ value: string; label: string }>;
  canPublish: boolean;
}) {
  const t = useTranslations("admin.announcements");
  const tp = useTranslations("portal.announcements.priority");
  const [audience, setAudience] = useState(announcement?.audienceType ?? "school");
  const [body, setBody] = useState(announcement?.body ?? "");
  const status = announcement?.status ?? "draft";

  return (
    <ActionForm action={saveAnnouncementAction} className="grid gap-5 lg:grid-cols-3">
      <button type="submit" name="intent" value={status === "published" ? "publish" : status === "archived" ? "restore" : "draft"} hidden tabIndex={-1} aria-hidden />
      {announcement ? <input type="hidden" name="id" value={announcement.id} /> : null}
      <div className="space-y-5 lg:col-span-2">
        <Fieldset legend={t("content")}>
          <TextField name="title" label={t("titleField")} defaultValue={announcement?.title} required maxLength={300} />
          <TextAreaField name="body" label={t("body")} hint={t("bodyHint")} value={body} onChange={(e) => setBody(e.target.value)} rows={10} maxLength={20000} required />
          {body.trim() ? (
            <details className="rounded-md border border-line p-3">
              <summary className="cursor-pointer text-sm font-medium">{t("preview")}</summary>
              <div className="mt-3"><Markdown source={body} /></div>
            </details>
          ) : null}
        </Fieldset>
        <Fieldset legend={t("attachment")}>
          {announcement?.attachmentName ? (
            <div className="space-y-2">
              <p className="inline-flex items-center gap-1.5 text-sm"><Paperclip className="size-4" aria-hidden />{announcement.attachmentName}</p>
              <Checkbox name="removeAttachment" label={t("removeAttachment")} />
            </div>
          ) : null}
          <DirectUpload kind="document" folder={`${schoolId}/announcements`} name="attachment" label={announcement?.attachmentName ? t("replaceAttachment") : t("addAttachment")} />
        </Fieldset>
      </div>
      <div className="space-y-5">
        <Fieldset legend={t("audience")}>
          <SelectField
            name="priority"
            label={t("priority")}
            defaultValue={announcement?.priority ?? "normal"}
            options={(["normal", "important", "critical"] as const).map((p) => ({ value: p, label: tp(p) }))}
          />
          <SelectField
            name="audienceType"
            label={t("audienceType")}
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            options={(["school", "staff", "students", "parents", "roles", "classes", ...(canPublish ? (["public"] as const) : [])] as const).map((a) => ({ value: a, label: t(`audiences.${a}`) }))}
          />
          {audience === "roles" ? (
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">{t("roles")}</legend>
              {roles.map((role) => <Checkbox key={role.value} name="audienceRoles" value={role.value} defaultChecked={announcement?.audienceRoles.includes(role.value)} label={role.label} />)}
              <GroupError name="audienceRoles" />
            </fieldset>
          ) : null}
          {audience === "classes" ? (
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">{t("classes")}</legend>
              <div className="grid max-h-56 grid-cols-2 overflow-y-auto">
                {classes.map((c) => <Checkbox key={c.value} name="audienceClassIds" value={c.value} defaultChecked={announcement?.audienceClassIds.includes(c.value)} label={c.label} />)}
              </div>
              <p className="text-xs text-ink-muted">{t("classesHint")}</p>
              <GroupError name="audienceClassIds" />
            </fieldset>
          ) : null}
        </Fieldset>
        <Fieldset legend={t("schedule")}>
          <TextField name="publishAt" type="datetime-local" label={t("publishAt")} hint={t("publishAtHint")} defaultValue={announcement?.publishAt} />
          <TextField name="expiresAt" type="datetime-local" label={t("expiresAt")} defaultValue={announcement?.expiresAt} />
        </Fieldset>
        <div className="flex flex-col gap-2">
          {canPublish && status !== "archived" ? <SubmitButton name="intent" value="publish">{status === "published" ? t("savePublished") : t("publish")}</SubmitButton> : null}
          {status !== "published" && status !== "archived" ? <SubmitButton name="intent" value="draft" variant="secondary">{t("saveDraft")}</SubmitButton> : null}
          {canPublish && announcement && status !== "archived" ? <SubmitButton name="intent" value="archive" variant="ghost">{t("archive")}</SubmitButton> : null}
          {status === "archived" ? <SubmitButton name="intent" value="restore" variant="secondary">{t("restore")}</SubmitButton> : null}
          <p className="text-xs text-ink-muted">{canPublish ? t("publishHint") : t("draftOnlyHint")}</p>
        </div>
      </div>
    </ActionForm>
  );
}
