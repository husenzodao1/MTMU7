"use client";

import { useTranslations } from "next-intl";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { DirectUpload } from "@/components/ui/direct-upload";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form-controls";
import { saveAssignmentAction } from "@/features/teach/homework-actions";

export interface AssignmentFormValues {
  id: string;
  classSubjectId: string;
  title: string;
  instructions: string | null;
  dueAt: string;
  maxScore: number | null;
  allowSubmissions: boolean;
  status: string;
}

export function AssignmentForm({
  assignment,
  classSubjects,
  defaultClassSubjectId,
  uploadFolder,
}: {
  assignment: AssignmentFormValues | null;
  classSubjects: Array<{ value: string; label: string }>;
  defaultClassSubjectId?: string;
  uploadFolder: string;
}) {
  const t = useTranslations("teach.homework");
  const status = assignment?.status ?? "draft";
  return (
    <ActionForm action={saveAssignmentAction} className="space-y-4">
      {/* Default button for Enter-key submission: never publishes a draft by accident. */}
      <button type="submit" name="intent" value={status === "draft" ? "draft" : status === "archived" ? "restore" : "publish"} hidden tabIndex={-1} aria-hidden />
      {assignment ? <input type="hidden" name="id" value={assignment.id} /> : null}
      {assignment ? (
        <input type="hidden" name="classSubjectId" value={assignment.classSubjectId} />
      ) : (
        <SelectField name="classSubjectId" label={t("classSubject")} options={classSubjects} defaultValue={defaultClassSubjectId} placeholder={t("chooseClass")} required />
      )}
      <TextField name="title" label={t("assignmentTitle")} defaultValue={assignment?.title} required maxLength={300} />
      <TextAreaField name="instructions" label={t("instructions")} hint={t("instructionsHint")} defaultValue={assignment?.instructions ?? ""} rows={8} maxLength={20000} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="dueAt" type="datetime-local" label={t("dueAt")} defaultValue={assignment?.dueAt} />
        <TextField name="maxScore" inputMode="decimal" label={t("maxScore")} hint={t("maxScoreHint")} defaultValue={assignment?.maxScore ?? ""} />
      </div>
      <Checkbox name="allowSubmissions" defaultChecked={assignment?.allowSubmissions ?? true} label={t("allowSubmissions")} description={t("allowSubmissionsHint")} />
      <DirectUpload kind="homework" folder={uploadFolder} name="attachment" label={t("attachment")} />
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        {status === "archived" ? (
          <SubmitButton name="intent" value="restore" variant="secondary">{t("restore")}</SubmitButton>
        ) : (
          <>
            <SubmitButton name="intent" value="publish">{status === "published" ? t("savePublished") : t("publish")}</SubmitButton>
            {status !== "published" ? <SubmitButton name="intent" value="draft" variant="secondary">{t("saveDraft")}</SubmitButton> : null}
            {assignment ? <SubmitButton name="intent" value="archive" variant="ghost">{t("archive")}</SubmitButton> : null}
          </>
        )}
      </div>
    </ActionForm>
  );
}
