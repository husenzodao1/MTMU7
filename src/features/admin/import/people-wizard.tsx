"use client";

import { BookOpen, CircleCheck, Download, FileSpreadsheet, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Alert } from "@/components/ui/surface";
import { previewPeopleImportAction } from "@/features/admin/import/people-actions";
import type { PeopleOutcome } from "@/features/admin/import/people-import";
import { PEOPLE_TEMPLATES, type PeopleKind } from "@/features/admin/import/templates";
import { cn } from "@/lib/utils/cn";

type Step = "upload" | "preview" | "done";

/**
 * Download the workbook → fill it in → check it → import → get it back with the
 * logins and passwords filled in.
 *
 * The file is sent twice, once to be checked and once to be imported. That is
 * deliberate: nothing is held between the two steps, so a preview left open in
 * a tab cannot be confirmed against a file that has since changed.
 *
 * The workbook that comes back carries the only copy of the passwords. It is
 * handed over as a download the moment the import finishes, and never stored.
 */
export function PeopleImportWizard({ kind }: { kind: PeopleKind }) {
  const t = useTranslations("admin.import");
  const tRoot = useTranslations();
  const template = PEOPLE_TEMPLATES[kind];
  const inputId = useId();
  const fileRef = useRef<File | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<PeopleOutcome | null>(null);
  const [summary, setSummary] = useState<{ created: number; updated: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    fileRef.current = null;
    setStep("upload");
    setOutcome(null);
    setSummary(null);
    setProblem(null);
    setFileName("");
  };

  function onFile(file: File | undefined) {
    setProblem(null);
    if (!file) return;
    fileRef.current = file;
    setFileName(file.name);
    startTransition(async () => {
      const body = new FormData();
      body.set("file", file);
      const result = await previewPeopleImportAction(kind, body);
      if (!result.ok || !result.data) {
        const detail = !result.ok && result.fieldErrors?.file ? `: ${result.fieldErrors.file.join(", ")}` : "";
        setProblem(`${tRoot(result.ok ? "errors.unexpected" : result.message)}${detail}`);
        return;
      }
      setOutcome(result.data);
      setStep("preview");
    });
  }

  function confirmImport() {
    const file = fileRef.current;
    if (!file) return;
    startTransition(async () => {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch(`/admin/import/people/${kind}`, { method: "POST", body });
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { message?: string } | null;
        setProblem(tRoot(detail?.message ?? "errors.unexpected"));
        return;
      }

      // The passwords live in this response and nowhere else, so the file is
      // put in front of the administrator before anything else happens.
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${kind}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);

      setSummary({
        created: Number(response.headers.get("X-Import-Created") ?? 0),
        updated: Number(response.headers.get("X-Import-Updated") ?? 0),
      });
      setStep("done");
    });
  }

  const errorsByRow = new Map<number, Array<{ field: string; code: string }>>();
  for (const issue of outcome?.errors ?? []) {
    errorsByRow.set(issue.row, [...(errorsByRow.get(issue.row) ?? []), { field: issue.field, code: issue.code }]);
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
          <p className="text-sm text-ink-secondary">{t("workbook.instructions")}</p>
          <div className="rounded-lg border border-line bg-surface-muted/40 p-4 text-sm">
            <p className="font-medium text-ink">{t("columns")}</p>
            <p className="mt-1 break-words text-xs text-ink-secondary">
              {template.columns.map((column) => (column.required ? `${column.header}*` : column.header)).join(" · ")}
            </p>
            <ul className="mt-3 space-y-1 text-ink-muted">
              {template.instructions.map((line) => (
                <li key={line}>— {line}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a href={`/admin/import/template/${kind}`} download className={buttonClasses("secondary")}>
              <Download aria-hidden />
              {t("downloadTemplate")}
            </a>
            {/* The blank workbook says what the columns are; this says what they
                look like when they are right. */}
            <a href={`/admin/import/template/${kind}?sample=1`} download className={buttonClasses("ghost")}>
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
              onChange={(event) => onFile(event.target.files?.[0])}
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

          {outcome.newClasses.length > 0 ? (
            <Alert tone="info" title={t("workbook.newClassesTitle")}>
              {t("workbook.newClasses", { classes: outcome.newClasses.join(", ") })}
            </Alert>
          ) : null}

          {outcome.errors.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <caption className="sr-only">{t("previewCaption")}</caption>
                <thead>
                  <tr className="border-b border-line bg-surface-muted/60 text-xs uppercase tracking-wide text-ink-muted">
                    <th scope="col" className="px-3 py-2 text-start">
                      {t("workbook.rowNumber")}
                    </th>
                    <th scope="col" className="px-3 py-2 text-start">
                      {t("result")}
                    </th>
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
                                {t.has(`fields.${issue.field}`) ? t(`fields.${issue.field}`) : issue.field}:{" "}
                                {t.has(`codes.${issue.code}`) ? t(`codes.${issue.code}`) : issue.code}
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
              <Button onClick={confirmImport} loading={pending}>
                {t("workbook.confirm", { total: outcome.total })}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={reset} disabled={pending}>
              {outcome.valid ? tRoot("common.cancel") : t("chooseAnother")}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "done" && summary ? (
        <Alert tone="success" title={t("doneTitle")}>
          <p>{t("workbook.done", { created: summary.created, updated: summary.updated })}</p>
          <p className="mt-2 font-medium">{t("workbook.keepTheFile")}</p>
          <p className="mt-3 flex flex-wrap gap-2">
            <Link href={kind === "students" ? "/admin/students" : "/admin/staff"} className={buttonClasses("secondary", "sm")}>
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
