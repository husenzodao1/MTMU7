import "server-only";
import { readSheet } from "read-excel-file/node";
import { cellText } from "@/lib/import/cells";
import { normalizeHeader } from "@/features/admin/import/templates";

/**
 * Reading a workbook the school office filled in.
 *
 * The office will open the file in Excel, LibreOffice or Google Sheets, retype
 * a heading, reorder the columns and save it again. So headings are matched by
 * their text rather than their position, unknown columns are kept rather than
 * dropped, and a cell that has quietly become a date or a number on the way is
 * turned back into the text the importer expects.
 *
 * This never runs in the browser: a spreadsheet parser has no business in an
 * admin bundle for a page used twice a year, and the reader and the writer
 * share one description of the columns only if both stay on the server.
 */

export interface SheetRead {
  /** Headings as they were actually written, in their original order. */
  headers: string[];
  /** One entry per data row, keyed by the canonical column key. */
  rows: Array<Record<string, string>>;
  /** Columns the template does not know, kept so they can be written back. */
  extras: Array<{ header: string; values: string[] }>;
}

// Written out rather than declared as constructor parameters: Node strips
// types without compiling them, and a parameter property is syntax it cannot
// strip, which would put this module out of reach of the tests.
export class SheetMissingError extends Error {
  readonly sheet: string;
  constructor(sheet: string) {
    super(`sheet_missing:${sheet}`);
    this.sheet = sheet;
  }
}

export class ColumnsMissingError extends Error {
  readonly headers: string[];
  constructor(headers: string[]) {
    super(`columns_missing:${headers.join(", ")}`);
    this.headers = headers;
  }
}

export interface ColumnMatch {
  key: string;
  header: string;
  required?: boolean;
}

/**
 * Reads one sheet into rows keyed by the canonical column keys.
 *
 * `maxRows` counts data rows; a file over the limit is refused rather than
 * truncated, because a silently shortened register is a register with pupils
 * missing from it.
 */
export async function readSheetRows(
  file: Buffer,
  sheetName: string,
  columns: readonly ColumnMatch[],
  maxRows: number
): Promise<SheetRead> {
  let raw: unknown[][];
  try {
    raw = (await readSheet(file, sheetName)) as unknown[][];
  } catch {
    // Whatever went wrong — no such sheet, not a spreadsheet at all, a file
    // that never finished uploading — the office needs the same instruction:
    // this is not the workbook we handed you.
    throw new SheetMissingError(sheetName);
  }
  if (raw.length === 0) throw new SheetMissingError(sheetName);

  const headers = (raw[0] ?? []).map((cell) => cellText(cell));
  const position = new Map<string, number>();
  for (const [index, header] of headers.entries()) {
    const key = normalizeHeader(header);
    if (key && !position.has(key)) position.set(key, index);
  }

  const missing = columns
    .filter((column) => column.required && !position.has(normalizeHeader(column.header)))
    .map((column) => column.header);
  if (missing.length > 0) throw new ColumnsMissingError(missing);

  const known = new Set(columns.map((column) => normalizeHeader(column.header)));
  const body = raw.slice(1).filter((row) => row.some((cell) => cellText(cell) !== ""));
  if (body.length > maxRows) throw new RangeError(`too_many_rows:${body.length}`);

  const rows = body.map((row) => {
    const record: Record<string, string> = {};
    for (const column of columns) {
      const index = position.get(normalizeHeader(column.header));
      record[column.key] = index == null ? "" : cellText(row[index]).slice(0, 500);
    }
    return record;
  });

  const extras = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => header !== "" && !known.has(normalizeHeader(header)))
    .map(({ header, index }) => ({ header, values: body.map((row) => cellText(row[index])) }));

  return { headers, rows, extras };
}
