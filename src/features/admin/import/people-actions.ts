"use server";

import { failure, success, type ActionResult } from "@/lib/actions/result";
import { mapDbError } from "@/lib/actions/errors";
import { can, getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { readPeopleSheet, type PeopleOutcome } from "@/features/admin/import/people-import";
import { isPeopleKind } from "@/features/admin/import/templates";
import { phoneConflicts } from "@/features/admin/import/phone-conflicts";
import { myHomeroomClasses } from "@/features/accounts/queries";

/**
 * Checks a workbook and reports everything wrong with it, writing nothing.
 *
 * The office corrects the file in one pass rather than one row per attempt, so
 * the whole list of problems matters more than the first of them. The answer
 * also names the classes the import would bring into being, which is where a
 * mistyped class name is caught — before it exists.
 */
export async function previewPeopleImportAction(kind: string, formData: FormData): Promise<ActionResult<PeopleOutcome>> {
  const access = await getAccess();
  if (!access?.school) return failure("errors.not_authenticated");
  if (!isPeopleKind(kind)) return failure("errors.invalid");
  // A class teacher imports the pupils of their own class (the database keeps
  // them to it, row by row).
  if (!can(access, kind === "students" ? "students.import" : "staff.create")) {
    if (kind !== "students" || (await myHomeroomClasses(access)).length === 0) return failure("errors.forbidden");
  }

  const sheet = await readPeopleSheet(kind, formData.get("file"));
  if (!sheet.ok) return sheet.result;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_people", {
    p_kind: kind,
    p_rows: sheet.rows,
    p_dry_run: true,
    p_offset: 0,
    p_limit: 0,
  });
  if (error) return mapDbError(error);
  const outcome = data as unknown as PeopleOutcome;
  const extra = await phoneConflicts(supabase, sheet.rows);
  if (extra.length > 0) {
    outcome.errors = [...outcome.errors, ...extra].sort((a, b) => a.row - b.row);
    outcome.valid = false;
  }
  return success(undefined, outcome);
}
