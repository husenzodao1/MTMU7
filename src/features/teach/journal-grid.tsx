"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/surface";
import { saveJournalCellsAction } from "@/features/teach/journal-actions";
import { cn } from "@/lib/utils/cn";

export interface JournalColumn {
  /** `${date}~${assessmentTypeId}`, which is what identifies a column. */
  key: string;
  date: string;
  typeId: string;
  /** The heading: a short date for a lesson, the label for a quarter. */
  heading: string;
  kind: "lesson" | "term";
  title: string;
}

export interface JournalRow {
  id: string;
  name: string;
  /** Current contents, keyed by column key: a mark, a letter, or "". */
  cells: Record<string, string>;
  average: number | null;
}

/**
 * The register, laid out the way a Tajik class journal is laid out: names down
 * the left, dates written vertically across the top, and one small square per
 * pupil per lesson.
 *
 * A square takes whatever the teacher writes in it — a mark, or a letter for an
 * absence. Working out which is which belongs to the database, in one place, so
 * the same rule holds whether the square was typed here or imported from a
 * workbook. This only refuses to send an empty change: everything else goes,
 * and what cannot be read comes back named.
 */
export function JournalGrid({
  classSubjectId,
  academicTermId,
  columns,
  rows,
  locked,
  readOnly,
}: {
  classSubjectId: string;
  academicTermId: string;
  columns: JournalColumn[];
  rows: JournalRow[];
  locked?: boolean;
  readOnly?: boolean;
}) {
  const t = useTranslations("teach.gradebook");
  const tRoot = useTranslations();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(0);
  const [pending, startTransition] = useTransition();
  const gridRef = useRef<HTMLTableElement>(null);

  const disabled = Boolean(locked || readOnly);
  const valueOf = (row: JournalRow, key: string) => draft[`${row.id}|${key}`] ?? row.cells[key] ?? "";
  const dirty = Object.keys(draft).length > 0;

  function write(rowId: string, key: string, value: string) {
    setDraft((current) => ({ ...current, [`${rowId}|${key}`]: value }));
    setRejected((current) => {
      if (!current.has(`${rowId}|${key}`)) return current;
      const next = new Set(current);
      next.delete(`${rowId}|${key}`);
      return next;
    });
  }

  /** Down a column with the arrow keys, because that is how a column is filled. */
  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, columnIndex: number) {
    const step = event.key === "ArrowDown" || event.key === "Enter" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const target = gridRef.current?.querySelector<HTMLInputElement>(
      `input[data-row="${rowIndex + step}"][data-col="${columnIndex}"]`
    );
    target?.focus();
    target?.select();
  }

  function save() {
    const cells = Object.entries(draft).map(([composite, value]) => {
      const [student, key] = composite.split("|") as [string, string];
      const column = columns.find((c) => c.key === key)!;
      return { student, date: column.date, type: column.typeId, value };
    });
    startTransition(async () => {
      const result = await saveJournalCellsAction(classSubjectId, academicTermId, cells);
      if (!result.ok) {
        setProblem(tRoot(result.message));
        return;
      }
      const outcome = result.data!;
      setProblem(null);
      setSaved(outcome.saved + outcome.cleared);
      if (outcome.errors.length === 0) {
        setDraft({});
        setRejected(new Set());
        return;
      }
      // Keep exactly what was refused on screen, and nothing else: the teacher
      // corrects those squares rather than hunting for them again.
      const bad = new Set(
        outcome.errors.map((issue) => {
          const column = columns.find((c) => c.date === issue.date);
          return `${issue.student}|${column?.key ?? ""}`;
        })
      );
      setRejected(bad);
      setDraft((current) => Object.fromEntries(Object.entries(current).filter(([composite]) => bad.has(composite))));
      setProblem(t("cellsRefused", { count: outcome.errors.length }));
    });
  }

  return (
    <div className="space-y-3">
      {problem ? <Alert tone="warning">{problem}</Alert> : null}
      {!problem && saved > 0 && !dirty ? <Alert tone="success">{t("cellsSaved", { count: saved })}</Alert> : null}

      <div className="overflow-x-auto">
        <table ref={gridRef} className="border-collapse text-sm">
          <caption className="sr-only">{t("journal")}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 min-w-56 border-b border-e border-line bg-surface-muted px-3 py-2 text-start align-bottom text-xs font-semibold uppercase tracking-wide text-ink-muted"
              >
                {t("student")}
              </th>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  title={column.title}
                  className={cn(
                    "border-b border-e border-line px-0 py-2 align-bottom",
                    column.kind === "term" && "bg-brand-50"
                  )}
                >
                  {/* Written upwards, as on the printed page: a date takes one
                      column's width instead of five. */}
                  <span
                    className="mx-auto block h-24 w-7 whitespace-nowrap text-xs font-medium tabular text-ink-secondary [writing-mode:vertical-rl]"
                    style={{ transform: "rotate(180deg)" }}
                  >
                    {column.heading}
                  </span>
                </th>
              ))}
              <th
                scope="col"
                className="border-b border-line px-3 py-2 text-end align-bottom text-xs font-semibold uppercase tracking-wide text-ink-muted"
              >
                {t("average")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.id} className="even:bg-surface-muted/30">
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-b border-e border-line bg-surface px-3 py-1 text-start font-medium"
                >
                  <span className="me-2 text-xs text-ink-muted tabular">{rowIndex + 1}.</span>
                  {row.name}
                </th>
                {columns.map((column, columnIndex) => {
                  const composite = `${row.id}|${column.key}`;
                  return (
                    <td key={column.key} className="border-b border-e border-line p-0">
                      <input
                        data-row={rowIndex}
                        data-col={columnIndex}
                        value={valueOf(row, column.key)}
                        onChange={(event) => write(row.id, column.key, event.target.value)}
                        onKeyDown={(event) => onKeyDown(event, rowIndex, columnIndex)}
                        onFocus={(event) => event.target.select()}
                        disabled={disabled}
                        maxLength={4}
                        inputMode="text"
                        aria-label={`${row.name} — ${column.title}`}
                        className={cn(
                          "h-9 w-9 border-0 bg-transparent text-center text-sm font-semibold tabular text-ink outline-none",
                          "focus:bg-brand-50 focus:ring-2 focus:ring-inset focus:ring-focus disabled:text-ink-muted",
                          rejected.has(composite) && "bg-danger-50 text-danger-700",
                          draft[composite] !== undefined && !rejected.has(composite) && "bg-warning-50"
                        )}
                      />
                    </td>
                  );
                })}
                <td className="border-b border-line px-3 py-1 text-end font-semibold tabular">
                  {row.average === null ? "—" : `${row.average}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {columns.length === 0 ? <p className="text-sm text-ink-muted">{t("noColumns")}</p> : null}

      {!disabled ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} loading={pending} disabled={!dirty}>
            {t("saveCells")}
          </Button>
          <p className="text-sm text-ink-muted">{t("cellHelp")}</p>
        </div>
      ) : null}
    </div>
  );
}
