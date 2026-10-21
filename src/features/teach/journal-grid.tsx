"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Lock, Maximize2, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, CardBody, CardHeader } from "@/components/ui/surface";
import { saveJournalCellsAction } from "@/features/teach/journal-actions";
import { type LessonTopic } from "@/features/teach/lesson-topics";
import { formatDate } from "@/lib/i18n/format";
import { type Locale } from "@/lib/i18n/text";
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
  /** A lesson still to come: shown with a lock, nothing written in it yet (00100). */
  closed?: boolean;
}

export interface JournalRow {
  id: string;
  name: string;
  /** Current contents, keyed by column key: a mark, a letter, or "". */
  cells: Record<string, string>;
  /** The squares holding an approved mark this person may no longer change (00100). */
  locked?: string[];
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
 *
 * The button at the head of the card opens the same register over the whole
 * screen, with bigger squares, for filling a column in comfort. Whatever was
 * typed goes with it: it is one register shown in one place or the other.
 */
export function JournalGrid({
  title,
  description,
  classSubjectId,
  academicTermId,
  columns,
  rows,
  topics,
  locked,
  readOnly,
}: {
  title: string;
  description?: string;
  classSubjectId: string;
  academicTermId: string;
  columns: JournalColumn[];
  rows: JournalRow[];
  /** What each lesson was about, by date — shown, read only, under a tapped day. */
  topics?: LessonTopic[];
  locked?: boolean;
  readOnly?: boolean;
}) {
  const t = useTranslations("teach.gradebook");
  const tRoot = useTranslations();
  const locale = useLocale() as Locale;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(0);
  const [pending, startTransition] = useTransition();
  const [full, setFull] = useState(false);
  // The day whose lesson a teacher tapped a column to read — its topic and
  // homework are shown, read only, under the register. Null when none is open.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const gridRef = useRef<HTMLTableElement>(null);

  const disabled = Boolean(locked || readOnly);
  const valueOf = (row: JournalRow, key: string) => draft[`${row.id}|${key}`] ?? row.cells[key] ?? "";
  const dirty = Object.keys(draft).length > 0;

  // The lesson behind the open column, and what it was about (by its date).
  const openColumn = openKey ? (columns.find((c) => c.key === openKey && c.kind === "lesson") ?? null) : null;
  const openTopic = openColumn ? (topics?.find((x) => x.date === openColumn.date) ?? null) : null;

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

  /**
   * Over the whole page. Not the browser's own full screen: phones and the
   * app's web views take it and give it back at their own whim, and the
   * register would close under the teacher's fingers.
   */
  useEffect(() => {
    if (!full) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFull(false);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [full]);

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

  const notes = (
    <>
      {problem ? <Alert tone="warning">{problem}</Alert> : null}
      {!problem && saved > 0 && !dirty ? <Alert tone="success">{t("cellsSaved", { count: saved })}</Alert> : null}
    </>
  );

  const table = (
    <table ref={gridRef} className={cn("border-collapse", full ? "text-base" : "text-sm")}>
      <caption className="sr-only">{t("journal")}</caption>
      <thead>
        <tr>
          <th
            scope="col"
            className={cn(
              "sticky left-0 z-20 min-w-[8.5rem] border-b border-e border-line bg-surface-muted px-2 py-2 text-start align-bottom text-xs font-semibold uppercase tracking-wide text-ink-muted sm:min-w-56 sm:px-3",
              full && "top-0 z-30"
            )}
          >
            {t("student")}
          </th>
          {columns.map((column) => {
            const open = openKey === column.key && column.kind === "lesson";
            // Written upwards, as on the printed page: a date takes one column's
            // width instead of five. A lesson still to come wears a lock over
            // its date; the open day's heading turns brand so it is plain which
            // column the note below belongs to.
            const inner = (
              <>
                {column.closed ? <Lock className="mb-1 size-3 text-ink-muted" aria-hidden /> : null}
                <span
                  className={cn(
                    "block whitespace-nowrap text-xs font-medium tabular [writing-mode:vertical-rl]",
                    open ? "text-brand-text" : "text-ink-secondary",
                    full ? "h-20 w-11" : "h-24 w-7"
                  )}
                  style={{ transform: "rotate(180deg)" }}
                >
                  {column.heading}
                </span>
              </>
            );
            return (
              <th
                key={column.key}
                scope="col"
                title={column.title}
                aria-selected={open || undefined}
                className={cn(
                  "border-b border-e border-line px-0 py-2 align-bottom",
                  column.kind === "term" ? "bg-brand-50" : open ? "bg-brand-50" : full && "bg-surface",
                  full && "sticky top-0 z-10"
                )}
              >
                {/* A lesson column is a button: tapping it reads that day's
                    topic and homework under the register, without changing a
                    thing. Term columns hold no lesson, so they stay plain. */}
                {column.kind === "lesson" ? (
                  <button
                    type="button"
                    onClick={() => setOpenKey((current) => (current === column.key ? null : column.key))}
                    aria-pressed={open}
                    aria-label={t("showDay")}
                    className="mx-auto flex cursor-pointer flex-col items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
                  >
                    {inner}
                  </button>
                ) : (
                  <div className="mx-auto flex flex-col items-center">{inner}</div>
                )}
              </th>
            );
          })}
          <th
            scope="col"
            className={cn(
              "border-b border-line px-3 py-2 text-end align-bottom text-xs font-semibold uppercase tracking-wide text-ink-muted",
              full && "sticky top-0 z-10 bg-surface"
            )}
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
              className="sticky left-0 z-10 max-w-[8.5rem] truncate border-b border-e border-line bg-surface px-2 py-1 text-start text-[0.8125rem] font-medium sm:max-w-none sm:px-3 sm:text-sm"
              title={row.name}
            >
              <span className="me-1.5 text-xs text-ink-muted tabular sm:me-2">{rowIndex + 1}.</span>
              {/* The pupil's card: their parents, and a note to them through
                  the bot. On a phone the surname and an initial, so more of
                  the dates fit beside it. */}
              <Link href={`/teach/pupils/${row.id}`} className="hover:text-brand-text hover:underline">
                <span className="sm:hidden">{shortName(row.name)}</span>
                <span className="hidden sm:inline">{row.name}</span>
              </Link>
            </th>
            {columns.map((column, columnIndex) => {
              const composite = `${row.id}|${column.key}`;
              const approved = row.locked?.includes(column.key) ?? false;
              const shut = disabled || column.closed || approved;
              return (
                <td
                  key={column.key}
                  className={cn("relative border-b border-e border-line p-0", column.closed && "bg-surface-muted/60", approved && "journal-approved")}
                  title={approved ? t("approvedCell") : column.closed ? t("closedColumn") : undefined}
                >
                  <input
                    data-row={rowIndex}
                    data-col={columnIndex}
                    value={valueOf(row, column.key)}
                    onChange={(event) => write(row.id, column.key, event.target.value)}
                    onKeyDown={(event) => onKeyDown(event, rowIndex, columnIndex)}
                    onFocus={(event) => event.target.select()}
                    disabled={shut}
                    maxLength={4}
                    inputMode="text"
                    aria-label={`${row.name} — ${column.title}`}
                    className={cn(
                      "border-0 bg-transparent text-center font-semibold tabular text-ink outline-none",
                      full ? "h-12 w-11 text-base" : "h-9 w-9 text-sm",
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
  );

  // The read-only note under a tapped day: its date, the lesson's topic and the
  // homework set. A day with nothing written says so; nothing here can be edited.
  const dayPanel = openColumn ? (
    <div className="rounded-xl border border-line bg-surface-muted/50 p-3 text-sm" role="region" aria-label={t("topic")}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold text-ink">{formatDate(openColumn.date, locale)}</span>
        <button
          type="button"
          onClick={() => setOpenKey(null)}
          aria-label={t("closeDay")}
          className="-m-1 rounded-md p-1 text-ink-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {openTopic ? (
        <>
          <p className="text-ink">{openTopic.topic}</p>
          {openTopic.homework ? (
            <p className="mt-1 text-xs text-ink-muted">
              <span className="font-medium">{t("homework")}:</span> {openTopic.homework}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-ink-muted">{t("noTopicForDay")}</p>
      )}
    </div>
  ) : null;

  const footer = (
    <>
      {columns.length === 0 ? <p className="text-sm text-ink-muted">{t("noColumns")}</p> : null}
      {!disabled ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} loading={pending} disabled={!dirty}>
            {t("saveCells")}
          </Button>
          <p className="text-sm text-ink-muted">{t("cellHelp")}</p>
        </div>
      ) : null}
    </>
  );

  return (
    <>
      <CardHeader
        title={title}
        description={description}
        // The button stays in the corner, beside the title, on a phone too.
        className="flex-nowrap"
        actions={
          <button
            type="button"
            onClick={() => setFull(true)}
            aria-label={t("fullScreen")}
            title={t("fullScreen")}
            className="inline-flex size-9 items-center justify-center rounded-lg text-ink-muted transition hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Maximize2 className="size-[1.125rem]" aria-hidden />
          </button>
        }
      />
      <CardBody>
        {full ? (
          <p className="text-sm text-ink-muted">{t("fullScreenOpen")}</p>
        ) : (
          <div className="space-y-3">
            {notes}
            <div className="overflow-x-auto">{table}</div>
            {dayPanel}
            {footer}
          </div>
        )}
      </CardBody>
      {full
        ? createPortal(
            // role="dialog" + data-state="open": the app's back button closes
            // it first, as it closes any dialog (features/native/native-app.tsx).
            <div
              role="dialog"
              aria-modal="true"
              aria-label={title}
              data-state="open"
              className="fixed inset-0 z-[70] flex flex-col bg-surface"
            >
              <div className="flex items-center gap-2 border-b border-line px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5">
                <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{title}</h2>
                {!disabled ? (
                  <Button size="sm" onClick={save} loading={pending} disabled={!dirty}>
                    {t("saveCells")}
                  </Button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setFull(false)}
                  aria-label={t("exitFullScreen")}
                  title={t("exitFullScreen")}
                  className="inline-flex size-10 items-center justify-center rounded-lg text-ink-muted transition hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <Minimize2 className="size-5" aria-hidden />
                </button>
              </div>
              {problem || saved > 0 ? <div className="space-y-2 px-3 pt-2 sm:px-5">{notes}</div> : null}
              <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-1 pb-[env(safe-area-inset-bottom)] sm:px-3">{table}</div>
              {dayPanel ? <div className="border-t border-line px-3 py-2 sm:px-5">{dayPanel}</div> : null}
              {!disabled ? (
                <p className="border-t border-line px-3 py-2 text-xs text-ink-muted sm:px-5">{t("cellHelp")}</p>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

/** "Каримов Алишер Валиевич" → "Каримов А." */
function shortName(name: string): string {
  const [surname, given] = name.trim().split(/\s+/);
  return given ? `${surname} ${given.charAt(0)}.` : (surname ?? name);
}
