"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ActionForm, SubmitButton, useFieldError } from "@/components/ui/action-form";
import { Input, Select } from "@/components/ui/form-controls";
import { saveGradesAction } from "@/features/teach/grade-actions";

export interface GradeEntryStudent {
  id: string;
  name: string;
  gradeId: string | null;
  score: number | null;
  comment: string | null;
  approved: boolean;
  /** present | absent | late | excused, or null when nothing was marked. */
  attendance: string | null;
}

/** The letters a Tajik journal puts in a column when there is no mark. */
const ATTENDANCE_OPTIONS = ["present", "absent", "late", "excused"] as const;

function ScoreCell({ student, max, disabled }: { student: GradeEntryStudent; max: number; disabled: boolean }) {
  const t = useTranslations("teach.gradebook");
  const error = useFieldError(`score_${student.id}`);
  return (
    <div className="flex flex-col gap-1">
      <Input
        name={`score_${student.id}`}
        inputMode="decimal"
        defaultValue={student.score ?? ""}
        disabled={disabled}
        aria-label={t("scoreFor", { name: student.name, max })}
        aria-invalid={error ? true : undefined}
        className="h-9 w-20 text-center tabular"
        autoComplete="off"
      />
      {error ? <span className="text-xs text-danger-700" role="alert">{error}</span> : null}
    </div>
  );
}

export function GradeEntryForm({
  classSubjectId,
  types,
  students,
  initialTypeId,
  initialDate,
  minDate,
  maxDate,
  locked,
}: {
  classSubjectId: string;
  types: Array<{ id: string; label: string; maxScore: number }>;
  students: GradeEntryStudent[];
  initialTypeId: string | null;
  initialDate: string;
  minDate: string;
  maxDate: string;
  locked: boolean;
}) {
  const t = useTranslations("teach.gradebook");
  const [typeId, setTypeId] = useState(initialTypeId ?? types[0]?.id ?? "");
  const editing = Boolean(initialTypeId);
  const max = types.find((type) => type.id === typeId)?.maxScore ?? 5;

  return (
    <ActionForm action={saveGradesAction} className="space-y-4">
      <input type="hidden" name="classSubjectId" value={classSubjectId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{t("assessmentType")}</span>
          {editing ? <input type="hidden" name="assessmentTypeId" value={typeId} /> : null}
          <Select name={editing ? undefined : "assessmentTypeId"} value={typeId} onChange={(e) => setTypeId(e.target.value)} disabled={editing || locked}>
            {types.map((type) => (
              <option key={type.id} value={type.id}>{t("typeOption", { name: type.label, max: type.maxScore })}</option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{t("date")}</span>
          {editing ? <input type="hidden" name="date" value={initialDate} /> : null}
          <Input type="date" name={editing ? undefined : "date"} defaultValue={initialDate} min={minDate} max={maxDate} disabled={editing || locked} required />
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[32rem] text-sm">
          <caption className="sr-only">{t("entryCaption")}</caption>
          <thead>
            <tr className="border-b border-line bg-surface-muted/60 text-start text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <th scope="col" className="px-3 py-2 text-start">{t("student")}</th>
              <th scope="col" className="px-3 py-2 text-start">{t("score", { max })}</th>
              <th scope="col" className="px-3 py-2 text-start">{t("attendance")}</th>
              <th scope="col" className="px-3 py-2 text-start">{t("comment")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {students.map((student) => {
              const disabled = locked || student.approved;
              return (
                <tr key={student.id}>
                  <th scope="row" className="px-3 py-2 text-start font-medium">
                    <input type="hidden" name="student" value={student.id} />
                    {student.gradeId ? (
                      <>
                        <input type="hidden" name={`grade_${student.id}`} value={student.gradeId} />
                        <input type="hidden" name={`original_${student.id}`} value={student.score ?? ""} />
                        <input type="hidden" name={`originalComment_${student.id}`} value={student.comment ?? ""} />
                      </>
                    ) : null}
                    {student.name}
                    {student.approved ? <span className="ms-2 text-xs font-normal text-ink-muted">({t("approved")})</span> : null}
                  </th>
                  <td className="px-3 py-2">
                    <ScoreCell student={student} max={max} disabled={disabled} />
                  </td>
                  <td className="px-3 py-2">
                    {/* "clear" is how a mark already set is taken away again;
                        an untouched row sends nothing and changes nothing. */}
                    <Select
                      name={`attendance_${student.id}`}
                      defaultValue={student.attendance ?? ""}
                      disabled={disabled}
                      aria-label={t("attendanceFor", { name: student.name })}
                      className="h-9 w-32"
                    >
                      <option value="">{t("attendanceNone")}</option>
                      {ATTENDANCE_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {t(`attendanceStatus.${status}`)}
                        </option>
                      ))}
                      {student.attendance ? <option value="clear">{t("attendanceClear")}</option> : null}
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      name={`comment_${student.id}`}
                      defaultValue={student.comment ?? ""}
                      maxLength={1000}
                      disabled={disabled}
                      aria-label={t("commentFor", { name: student.name })}
                      className="h-9"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-muted">{t("entryHint")}</p>
      {!locked ? <SubmitButton>{t("save")}</SubmitButton> : null}
    </ActionForm>
  );
}
