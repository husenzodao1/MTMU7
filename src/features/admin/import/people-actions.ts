"use server";

import { failure, success, type ActionResult } from "@/lib/actions/result";
import { mapDbError } from "@/lib/actions/errors";
import { can, getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { readPeopleSheet, type PeopleOutcome } from "@/features/admin/import/people-import";
import { isPeopleKind } from "@/features/admin/import/templates";

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
  if (!can(access, kind === "students" ? "students.import" : "staff.create")) return failure("errors.forbidden");

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
  return success(undefined, data as unknown as PeopleOutcome);
}
