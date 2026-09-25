"use client";

import { BookOpen, CircleCheck, Download, FileSpreadsheet, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Alert } from "@/components/ui/surface";
import { importTimetableAction, type TimetableOutcome } from "@/features/admin/import/timetable-actions";
import { TIMETABLE_TEMPLATE } from "@/features/admin/import/templates";
import { cn } from "@/lib/utils/cn";

type Step = "upload" | "preview" | "done";

/** Download the grid → fill it in → check it → replace the week. */
export function TimetableImportWizard() {
  const t = useTranslations("admin.import");
  const tRoot = useTranslations();
  const inputId = useId();
  const fileRef = useRef<File | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<TimetableOutcome | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    fileRef.current = null;
    setStep("upload");
    setOutcome(null);
    setProblem(null);
    setFileName("");
  };

  function send(file: File, dryRun: boolean) {
    startTransition(async () => {
      const body = new FormData();
      body.set("file", file);
      const result = await importTimetableAction(body, dryRun);
      if (!result.ok || !result.data) {
        const detail = !result.ok && result.fieldErrors?.file ? `: ${result.fieldErrors.file.join(", ")}` : "";
        setProblem(`${tRoot(result.ok ? "errors.unexpected" : result.message)}${detail}`);
        return;
      }
      setOutcome(result.data);
      setStep(dryRun ? "preview" : result.data.valid ? "done" : "preview");
    });
  }

  const errorsByRow = new Map<number, Array<{ field: string; code: string; detail?: string }>>();
  for (const issue of outcome?.errors ?? []) {
    errorsByRow.set(issue.row, [...(errorsByRow.get(issue.row) ?? []), issue]);
  }

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label={t("steps")}>
        {(["upload", "preview", "done"] as const).map((key, index) => (
          <li
            key={key}
            aria-current={step === key ? "step" : undefined}
            className={cn(
              "rounded-md border px-3 py-1.5",
              step === key ? "border-brand-600 bg-brand-50 font-medium text-brand-text-strong" : "border-line text-ink-muted"
            )}
          >
            {index + 1}. {t(`step.${key}`)}
          </li>
        ))}
      </ol>

      {problem ? <Alert tone="danger">{problem}</Alert> : null}

      {step === "upload" ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-line bg-surface-muted/40 p-4 text-sm">
            <ul className="space-y-1 text-ink-secondary">
              {TIMETABLE_TEMPLATE.instructions.map((line) => (
                <li key={line}>— {line}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* A file to save, not a page to visit: next/link would begin a
                client navigation to a route that answers with a download.
                (the rule reads the path, not the intent) */}
            <a href="/admin/import/template/timetable" download className={buttonClasses("secondary")}>
              <Download aria-hidden />
              {t("downloadTemplate")}
            </a>
            <a href="/admin/import/template/timetable?sample=1" download className={buttonClasses("ghost")}>
              <BookOpen aria-hidden />
              {t("workbook.downloadSample")}
            </a>
            <label
              htmlFor={inputId}
              className={cn(buttonClasses("primary"), "cursor-pointer", pending && "pointer-events-none opacity-60")}
            >
              <FileSpreadsheet aria-hidden />
              {pending ? t("validating") : t("chooseFile")}
            </label>
            <input
              id={inputId}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setProblem(null);
                fileRef.current = file;
                setFileName(file.name);
                send(file, true);
              }}
              disabled={pending}
            />
          </div>
        </div>
      ) : null}

      {step === "preview" && outcome ? (
        <div className="space-y-4">
          {outcome.valid ? (
            <Alert tone="success" title={t("readyTitle")}>
              {t("ready", { total: outcome.total, file: fileName })}
            </Alert>
          ) : (
            <Alert tone="warning" title={t("invalidTitle")}>
              {t("invalid", { rows: errorsByRow.size, total: outcome.total })}
            </Alert>
          )}

          {outcome.newSubjects.length > 0 ? (
            <Alert tone="info" title={t("timetable.newSubjectsTitle")}>
              {t("timetable.newSubjects", { subjects: outcome.newSubjects.join(", ") })}
            </Alert>
          ) : null}

          {outcome.errors.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <caption className="sr-only">{t("previewCaption")}</caption>
                <thead>
                  <tr className="border-b border-line bg-surface-muted/60 text-xs uppercase tracking-wide text-ink-muted">
                    <th scope="col" className="px-3 py-2 text-start">{t("workbook.rowNumber")}</th>
                    <th scope="col" className="px-3 py-2 text-start">{t("result")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...errorsByRow.entries()].slice(0, 200).map(([row, issues]) => (
                    <tr key={row} className="bg-danger-50/50">
                      <td className="px-3 py-2 tabular text-ink-muted">{row}</td>
                      <td className="px-3 py-2">
                        <ul className="space-y-0.5 text-xs text-danger-700">
                          {issues.map((issue) => (
                            <li key={`${issue.field}-${issue.code}`} className="flex items-start gap-1">
                              <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                              <span>
                                {t("timetable.cell", { field: issue.field.replace(/^p/, "") })}:{" "}
                                {t.has(`codes.${issue.code}`) ? t(`codes.${issue.code}`) : issue.code}
                                {issue.detail ? ` (${issue.detail})` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-success-700">
              <CircleCheck className="size-4" aria-hidden />
              {t("workbook.allRowsOk", { total: outcome.total })}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {outcome.valid ? (
              <Button onClick={() => fileRef.current && send(fileRef.current, false)} loading={pending}>
                {t("timetable.confirm", { total: outcome.total })}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={reset} disabled={pending}>
              {outcome.valid ? tRoot("common.cancel") : t("chooseAnother")}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "done" && outcome ? (
        <Alert tone="success" title={t("doneTitle")}>
          <p>{t("timetable.done", { lessons: outcome.written })}</p>
          <p className="mt-3 flex flex-wrap gap-2">
            <Link href="/admin/timetable" className={buttonClasses("secondary", "sm")}>
              {t("backToList")}
            </Link>
            <Button variant="ghost" size="sm" onClick={reset}>
              {t("importAnother")}
            </Button>
          </p>
        </Alert>
      ) : null}
    </div>
  );
}
