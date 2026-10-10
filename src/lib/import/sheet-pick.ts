/**
 * Finding the office's rows in a workbook that is not quite the one we handed
 * out.
 *
 * Kept apart from the reader, and free of any server-only import, so it can be
 * tested on plain arrays: the file itself only decides which sheets there are.
 */
import { cellText } from "./cells.ts";
import { normalizeHeader } from "../../features/admin/import/templates.ts";

export interface ColumnMatch {
  key: string;
  header: string;
  required?: boolean;
}

export interface NamedSheet {
  name: string;
  rows: unknown[][];
}

/** Whether a row carries every heading the template cannot do without. */
export function hasRequiredHeadings(row: readonly unknown[], columns: readonly ColumnMatch[]): boolean {
  const required = columns.filter((column) => column.required).map((column) => normalizeHeader(column.header));
  if (required.length === 0) return false;
  const cells = new Set(row.map((cell) => normalizeHeader(cellText(cell))));
  return required.every((heading) => cells.has(heading));
}

/**
 * When the sheet is not there by its name — the rows were pasted into a new
 * workbook whose only sheet is "Лист1", the tab was renamed or retyped on
 * another keyboard — the one whose name matches once retyping is forgiven, then
 * the one whose headings are the template's, then the only sheet with anything
 * on it, so the check can name the missing columns instead of refusing the
 * whole file. Null when the file leaves no way to tell.
 */
export function pickSheet(sheets: readonly NamedSheet[], sheetName: string, columns: readonly ColumnMatch[]): unknown[][] | null {
  const filled = sheets.filter((sheet) => sheet.rows.some((row) => row.some((cell) => cellText(cell) !== "")));
  const wanted = normalizeHeader(sheetName);
  const byName = filled.find((sheet) => normalizeHeader(sheet.name) === wanted);
  if (byName) return byName.rows;
  const byHeadings = filled.find((sheet) => sheet.rows.slice(0, 10).some((row) => hasRequiredHeadings(row, columns)));
  if (byHeadings) return byHeadings.rows;
  return filled.length === 1 ? filled[0]!.rows : null;
}

/**
 * The rows from the heading row on. A title typed above the headings
 * ("Ҷадвали дарсҳо, нимсолаи 1") moves them down a row or two; the headings are
 * wherever the required ones are, and the first row when they are nowhere, so
 * that the missing columns can be named.
 */
export function fromHeadingRow(rows: unknown[][], columns: readonly ColumnMatch[]): unknown[][] {
  const start = rows.slice(0, 10).findIndex((row) => hasRequiredHeadings(row, columns));
  return start > 0 ? rows.slice(start) : rows;
}
