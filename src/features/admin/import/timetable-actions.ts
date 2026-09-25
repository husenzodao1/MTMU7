"use server";

import { revalidatePath } from "next/cache";
import { failure, success, type ActionResult } from "@/lib/actions/result";
import { mapDbError } from "@/lib/actions/errors";
import { can, getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { ColumnsMissingError, readSheetRows, SheetMissingError } from "@/lib/import/xlsx";
import { TIMETABLE_TEMPLATE } from "@/features/admin/import/templates";

export interface TimetableOutcome {
  valid: boolean;
  total: number;
  errors: Array<{ row: number; field: string; code: string; detail?: string }>;
  written: number;
  newSubjects: string[];
}

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Reads the deputy head's grid and hands it to the database, either as a check
 * or for real.
 *
 * No file comes back from this one — a timetable has nothing to hand out — so
 * unlike the register it needs no route of its own, and preview and confirm are
 * the same action with one flag.
 */
export async function importTimetableAction(formData: FormData, dryRun: boolean): Promise<ActionResult<TimetableOutcome>> {
  const access = await getAccess();
  if (!access?.school) return failure("errors.not_authenticated");
  if (!can(access, "timetable.manage")) return failure("errors.forbidden");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return failure("admin.import.errors.noFile");
  if (file.size > MAX_BYTES) return failure("admin.import.errors.tooLarge");
  if (!/\.xlsx$/i.test(file.name)) return failure("admin.import.errors.notXlsx");

  let rows: Array<Record<string, string>>;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const read = await readSheetRows(buffer, TIMETABLE_TEMPLATE.sheet, TIMETABLE_TEMPLATE.columns, TIMETABLE_TEMPLATE.maxRows);
    if (read.rows.length === 0) return failure("errors.empty_import");
    rows = read.rows;
  } catch (error) {
    if (error instanceof SheetMissingError) return failure("admin.import.errors.sheetMissing", { file: [error.sheet] });
    if (error instanceof ColumnsMissingError) return failure("admin.import.errors.columnsMissing", { file: error.headers });
    if (error instanceof RangeError) return failure("errors.import_too_large");
    return failure("admin.import.errors.unreadable");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_timetable", { p_rows: rows, p_dry_run: dryRun });
  if (error) return mapDbError(error);

  const outcome = data as unknown as TimetableOutcome;
  if (!dryRun && outcome.valid) {
    revalidatePath("/admin/timetable", "layout");
    // Every pupil's and teacher's own week comes from the same rows.
    revalidatePath("/schedule");
    revalidatePath("/teach");
  }
  return success(undefined, outcome);
}
