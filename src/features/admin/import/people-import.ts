import "server-only";
import { failure, type ActionResult } from "@/lib/actions/result";
import { ColumnsMissingError, readSheetRows, SheetMissingError } from "@/lib/import/xlsx";
import { PEOPLE_TEMPLATES, type PeopleKind } from "@/features/admin/import/templates";

/** What import_people answers with, on both the preview and the real run. */
export interface PeopleOutcome {
  valid: boolean;
  total: number;
  errors: Array<{ row: number; field: string; code: string }>;
  created: number;
  updated: number;
  credentials: Array<{ row: number; login: string; password: string }>;
  newClasses: string[];
}

export interface SheetRows {
  rows: Array<Record<string, string>>;
  extras: Array<{ header: string; values: string[] }>;
}

/** 4 MB matches the server-action limit; a workbook of 2000 pupils is ~150 KB. */
const MAX_BYTES = 4 * 1024 * 1024;

type Parsed = ({ ok: true } & SheetRows) | { ok: false; result: ActionResult<never> };

/**
 * Turns the uploaded file into rows the import function understands, or into
 * the one message that says what is wrong with the file itself — a wrong
 * format, a missing sheet, a missing column, too many rows. Everything wrong
 * with the *contents* is the database's to report, row by row.
 */
export async function readPeopleSheet(kind: PeopleKind, file: unknown): Promise<Parsed> {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, result: failure("admin.import.errors.noFile") };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, result: failure("admin.import.errors.tooLarge") };
  }
  if (!/\.xlsx$/i.test(file.name)) {
    return { ok: false, result: failure("admin.import.errors.notXlsx") };
  }

  const template = PEOPLE_TEMPLATES[kind];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const read = await readSheetRows(buffer, template.sheet, template.columns, template.maxRows);
    if (read.rows.length === 0) return { ok: false, result: failure("errors.empty_import") };
    return { ok: true, rows: read.rows, extras: read.extras };
  } catch (error) {
    if (error instanceof SheetMissingError) {
      return { ok: false, result: failure("admin.import.errors.sheetMissing", { file: [error.sheet] }) };
    }
    if (error instanceof ColumnsMissingError) {
      return { ok: false, result: failure("admin.import.errors.columnsMissing", { file: error.headers }) };
    }
    if (error instanceof RangeError) {
      return { ok: false, result: failure("errors.import_too_large") };
    }
    return { ok: false, result: failure("admin.import.errors.unreadable") };
  }
}
