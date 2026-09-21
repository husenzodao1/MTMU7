"use client";

import { CheckCheck, MessageSquareText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ActionForm, SubmitButton, useFieldError } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { saveAttendanceAction } from "@/features/teach/attendance-actions";
import { cn } from "@/lib/utils/cn";

const STATUSES = ["present", "absent", "late", "excused"] as const;
type Status = (typeof STATUSES)[number];

export interface RosterRow {
  id: string;
  name: string;
  number: string | null;
  status: Status | null;
  minutesLate: number | null;
  note: string | null;
}

const tone: Record<Status, string> = {
  present: "peer-checked:border-success-600 peer-checked:bg-success-50 peer-checked:text-success-700",
  absent: "peer-checked:border-danger-600 peer-checked:bg-danger-50 peer-checked:text-danger-700",
  late: "peer-checked:border-warning-600 peer-checked:bg-warning-50 peer-checked:text-warning-700",
  excused: "peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:text-brand-text-strong",
};

function LateInput({ studentId, defaultValue, label }: { studentId: string; defaultValue: number | null; label: string }) {
  const error = useFieldError(`late_${studentId}`);
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-ink-secondary">{label}</span>
      <Input
        name={`late_${studentId}`}
        type="number"
        inputMode="numeric"
        min={1}
        max={240}
        defaultValue={defaultValue ?? ""}
        className="h-9 w-20"
        aria-invalid={error ? true : undefined}
      />
      {error ? <span className="text-danger-700" role="alert">{error}</span> : null}
    </label>
  );
}

export function AttendanceRoster({
  rows,
  classId,
  classSubjectId,
  date,
  period,
  readOnly,
}: {
  rows: RosterRow[];
  classId: string;
  classSubjectId: string | null;
  date: string;
  period: number | null;
  readOnly: boolean;
}) {
  const t = useTranslations("teach.attendance");
  const ts = useTranslations("common.status");
  const [statuses, setStatuses] = useState<Record<string, Status | null>>(() => Object.fromEntries(rows.map((r) => [r.id, r.status])));
  const [notesOpen, setNotesOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map((r) => [r.id, Boolean(r.note)])));

  const counts = useMemo(() => {
    const result = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 };
    for (const r of rows) {
      const s = statuses[r.id];
      if (s) result[s] += 1;
      else result.unmarked += 1;
    }
    return result;
  }, [rows, statuses]);

  return (
    <ActionForm action={saveAttendanceAction} className="space-y-4">
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="classSubjectId" value={classSubjectId ?? ""} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="period" value={period ?? ""} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-secondary" aria-live="polite">
          {t("summary", { present: counts.present, absent: counts.absent, late: counts.late, excused: counts.excused, unmarked: counts.unmarked })}
        </p>
        {!readOnly ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setStatuses((current) => Object.fromEntries(rows.map((r) => [r.id, current[r.id] ?? "present"])))}
          >
            <CheckCheck aria-hidden />
            {t("markRestPresent")}
          </Button>
        ) : null}
      </div>

      <ol className="divide-y divide-line rounded-xl border border-line bg-surface">
        {rows.map((row, index) => {
          const current = statuses[row.id];
          return (
            <li key={row.id} className="px-3 py-3 sm:px-4">
              <input type="hidden" name="student" value={row.id} />
              <fieldset disabled={readOnly} className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
                <legend className="sr-only">{row.name}</legend>
                <div className="flex min-w-0 flex-1 items-center gap-3" aria-hidden>
                  <span className="w-6 text-end text-sm text-ink-muted tabular">{index + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{row.name}</span>
                    {row.number ? <span className="block text-xs text-ink-muted">{row.number}</span> : null}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 sm:w-auto lg:w-[26rem]" role="radiogroup" aria-label={row.name}>
                  {STATUSES.map((status) => (
                    <label key={status} className="relative">
                      <input
                        type="radio"
                        name={`status_${row.id}`}
                        value={status}
                        checked={current === status}
                        onChange={() => setStatuses((s) => ({ ...s, [row.id]: status }))}
                        className="peer sr-only"
                      />
                      <span
                        className={cn(
                          "flex h-10 cursor-pointer items-center justify-center rounded-md border border-line-strong px-1 text-sm font-medium text-ink-secondary",
                          "peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600 peer-disabled:cursor-not-allowed",
                          tone[status]
                        )}
                      >
                        {ts(status)}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:w-56">
                  {current === "late" ? <LateInput studentId={row.id} defaultValue={row.minutesLate} label={t("minutes")} /> : null}
                  {!notesOpen[row.id] && !readOnly ? (
                    <Button variant="ghost" size="sm" onClick={() => setNotesOpen((n) => ({ ...n, [row.id]: true }))} aria-label={t("addNoteFor", { name: row.name })}>
                      <MessageSquareText aria-hidden />
                      {t("note")}
                    </Button>
                  ) : null}
                </div>
              </fieldset>
              {notesOpen[row.id] ? (
                <label className="mt-2 block lg:ms-9">
                  <span className="sr-only">{t("noteFor", { name: row.name })}</span>
                  <Input name={`note_${row.id}`} defaultValue={row.note ?? ""} maxLength={500} placeholder={t("notePlaceholder")} disabled={readOnly} className="h-9" />
                </label>
              ) : null}
            </li>
          );
        })}
      </ol>

      {!readOnly ? (
        <div className="sticky bottom-20 z-10 flex justify-end rounded-xl border border-line bg-surface/95 p-3 shadow-overlay lg:bottom-4">
          <SubmitButton className="w-full sm:w-auto">{t("save")}</SubmitButton>
        </div>
      ) : null}
    </ActionForm>
  );
}
