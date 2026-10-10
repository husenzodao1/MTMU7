"use server";

import { revalidatePath } from "next/cache";
import { failure, success, type ActionResult } from "@/lib/actions/result";
import { mapDbError } from "@/lib/actions/errors";
import { can, getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { ColumnsMissingError, readSheetRows, SheetMissingError } from "@/lib/import/xlsx";
import { SUBJECTS_TEMPLATE } from "@/features/admin/import/templates";

export interface SubjectsOutcome {
  valid: boolean;
  total: number;
  errors: Array<{ row: number; field: string; code: string; detail?: string }>;
  created: number;
  updated: number;
  newSubjects: string[];
}

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Reads the subjects sheet and hands it to the database, as a check or for
 * real — the same shape as the timetable's, one action with one flag.
 */
export async function importSubjectsAction(formData: FormData, dryRun: boolean): Promise<ActionResult<SubjectsOutcome>> {
  const access = await getAccess();
  if (!access?.school) return failure("errors.not_authenticated");
  if (!can(access, "subjects.manage")) return failure("errors.forbidden");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return failure("admin.import.errors.noFile");
  if (file.size > MAX_BYTES) return failure("admin.import.errors.tooLarge");
  if (!/\.xlsx$/i.test(file.name)) return failure("admin.import.errors.notXlsx");

  let rows: Array<Record<string, string>>;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const read = await readSheetRows(buffer, SUBJECTS_TEMPLATE.sheet, SUBJECTS_TEMPLATE.columns, SUBJECTS_TEMPLATE.maxRows);
    if (read.rows.length === 0) return failure("errors.empty_import");
    rows = read.rows;
  } catch (error) {
    if (error instanceof SheetMissingError) return failure("admin.import.errors.sheetMissing", { file: [error.sheet] });
    if (error instanceof ColumnsMissingError) return failure("admin.import.errors.columnsMissing", { file: error.headers });
    if (error instanceof RangeError) return failure("errors.import_too_large");
    return failure("admin.import.errors.unreadable");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_subjects", { p_rows: rows, p_dry_run: dryRun });
  if (error) return mapDbError(error);

  const outcome = data as unknown as SubjectsOutcome;
  if (!dryRun && outcome.valid) {
    revalidatePath("/admin/subjects");
    revalidatePath("/admin/classes", "layout");
  }
  return success(undefined, outcome);
}
