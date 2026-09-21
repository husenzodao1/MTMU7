"use client";

import { CircleCheck, Download, FileSpreadsheet, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Alert } from "@/components/ui/surface";
import { runImportAction } from "@/features/admin/import/actions";
import { IMPORT_CONFIG, type ImportKind, type ImportOutcome } from "@/features/admin/import/config";
import { parseCsv } from "@/lib/export/csv";
import { cn } from "@/lib/utils/cn";

type Step = "upload" | "preview" | "done";

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Upload → validate (database dry run) → preview → confirm → import.
 * Nothing is written until the administrator confirms a fully valid file.
 */
export function ImportWizard({ kind }: { kind: ImportKind }) {
  const t = useTranslations("admin.import");
  const tRoot = useTranslations();
  const config = IMPORT_CONFIG[kind];
  const inputId = useId();
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setStep("upload");
    setRows([]);
    setOutcome(null);
    setProblem(null);
    setFileName("");
  };

  async function onFile(file: File | undefined) {
    setProblem(null);
    if (!file) return;
    if (file.size > MAX_BYTES || !/\.csv$/i.test(file.name)) {
      setProblem(t("fileRules"));
      return;
    }
    const parsed = parseCsv(await file.text(), config.maxRows + 1);
    const missing = config.required.filter((column) => !parsed.headers.includes(column));
    if (missing.length > 0) {
      setProblem(t("missingColumns", { columns: missing.join(", ") }));
      return;
    }
    if (parsed.rows.length === 0) {
      setProblem(tRoot("errors.empty_import"));
      return;
    }
    if (parsed.rows.length > config.maxRows) {
      setProblem(t("tooManyRows", { max: config.maxRows }));
      return;
    }
    setFileName(file.name);
    setRows(parsed.rows);
    startTransition(async () => {
      const result = await runImportAction(kind, parsed.rows, true);
      if (!result.ok || !result.data) {
        setProblem(tRoot(result.ok ? "errors.unexpected" : result.message));
        return;
      }
      setOutcome(result.data);
      setStep("preview");
    });
  }

  function confirmImport() {
    startTransition(async () => {
      const result = await runImportAction(kind, rows, false);
      if (!result.ok || !result.data) {
        setProblem(tRoot(result.ok ? "errors.unexpected" : result.message));
        return;
      }
      setOutcome(result.data);
      setStep(result.data.valid && result.data.created > 0 ? "done" : "preview");
    });
  }

  const errorsByRow = new Map<number, Array<{ field: string; code: string }>>();
  for (const issue of outcome?.errors ?? []) {
    errorsByRow.set(issue.row, [...(errorsByRow.get(issue.row) ?? []), { field: issue.field, code: issue.code }]);
  }
  const previewRows = rows.slice(0, 200);

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label={t("steps")}>
        {(["upload", "preview", "done"] as const).map((key, index) => (
          <li key={key} aria-current={step === key ? "step" : undefined} className={cn("rounded-md border px-3 py-1.5", step === key ? "border-brand-600 bg-brand-50 font-medium text-brand-text-strong" : "border-line text-ink-muted")}>
            {index + 1}. {t(`step.${key}`)}
          </li>
        ))}
      </ol>

      {problem ? <Alert tone="danger">{problem}</Alert> : null}

      {step === "upload" ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-secondary">{t("instructions")}</p>
          <div className="rounded-lg border border-line bg-surface-muted/40 p-4 text-sm">
            <p className="font-medium text-ink">{t("columns")}</p>
            <p className="mt-1 break-words font-mono text-xs text-ink-secondary">{config.columns.join(", ")}</p>
            <p className="mt-2 text-ink-muted">{t("requiredColumns", { columns: config.required.join(", ") })}</p>
            <p className="mt-1 text-ink-muted">{t(`hints.${kind}`)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a href={`/admin/import/template/${kind}`} className={buttonClasses("secondary")}>
              <Download aria-hidden />
              {t("downloadTemplate")}
            </a>
            <label htmlFor={inputId} className={cn(buttonClasses("primary"), "cursor-pointer", pending && "pointer-events-none opacity-60")}>
              <FileSpreadsheet aria-hidden />
              {pending ? t("validating") : t("chooseFile")}
            </label>
            <input id={inputId} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} disabled={pending} />
          </div>
        </div>
      ) : null}

      {step === "preview" && outcome ? (
        <div className="space-y-4">
          {outcome.valid ? (
            <Alert tone="success" title={t("readyTitle")}>{t("ready", { total: outcome.total, file: fileName })}</Alert>
          ) : (
            <Alert tone="warning" title={t("invalidTitle")}>{t("invalid", { rows: errorsByRow.size, total: outcome.total })}</Alert>
          )}
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <caption className="sr-only">{t("previewCaption")}</caption>
              <thead>
                <tr className="border-b border-line bg-surface-muted/60 text-xs uppercase tracking-wide text-ink-muted">
                  <th scope="col" className="px-3 py-2 text-start">#</th>
                  <th scope="col" className="px-3 py-2 text-start">{t("result")}</th>
                  {config.columns.map((column) => (
                    <th key={column} scope="col" className="px-3 py-2 text-start font-mono normal-case">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {previewRows.map((row, index) => {
                  const issues = errorsByRow.get(index + 1) ?? [];
                  return (
                    <tr key={index} className={issues.length ? "bg-danger-50/50" : undefined}>
                      <td className="px-3 py-2 tabular text-ink-muted">{index + 1}</td>
                      <td className="px-3 py-2">
                        {issues.length === 0 ? (
                          <CircleCheck className="size-4 text-success-600" aria-label={t("rowOk")} />
                        ) : (
                          <ul className="space-y-0.5 text-xs text-danger-700">
                            {issues.map((issue) => (
                              <li key={`${issue.field}-${issue.code}`} className="flex items-start gap-1">
                                <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                                <span><span className="font-mono">{issue.field}</span>: {t.has(`codes.${issue.code}`) ? t(`codes.${issue.code}`) : issue.code}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      {config.columns.map((column) => (
                        <td key={column} className="max-w-48 truncate px-3 py-2">{row[column] ?? ""}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > previewRows.length ? <p className="text-sm text-ink-muted">{t("previewLimited", { shown: previewRows.length, total: rows.length })}</p> : null}
          <div className="flex flex-wrap gap-2">
            {outcome.valid ? (
              <Button onClick={confirmImport} loading={pending}>{t("confirm", { total: outcome.total })}</Button>
            ) : null}
            <Button variant="secondary" onClick={reset} disabled={pending}>{outcome.valid ? tRoot("common.cancel") : t("chooseAnother")}</Button>
          </div>
        </div>
      ) : null}

      {step === "done" && outcome ? (
        <Alert tone="success" title={t("doneTitle")}>
          <p>{t("done", { created: outcome.created })}</p>
          <p className="mt-3 flex flex-wrap gap-2">
            <Link href={config.returnTo} className={buttonClasses("secondary", "sm")}>{t("backToList")}</Link>
            <Button variant="ghost" size="sm" onClick={reset}>{t("importAnother")}</Button>
          </p>
        </Alert>
      ) : null}
    </div>
  );
}
