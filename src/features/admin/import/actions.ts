"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mapDbError } from "@/lib/actions/errors";
import { failure, success, type ActionResult } from "@/lib/actions/result";
import { can, getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { IMPORT_CONFIG, isImportKind, type ImportOutcome } from "@/features/admin/import/config";

const outcomeSchema = z.object({
  valid: z.boolean(),
  total: z.number(),
  created: z.number(),
  errors: z.array(z.object({ row: z.number(), field: z.string(), code: z.string() })),
});

/**
 * Validates (dry run) or performs an import. Rows are reduced to the
 * canonical columns and plain strings; the database function re-validates
 * everything and writes the audit entry.
 */
export async function runImportAction(kind: string, rows: unknown, dryRun: boolean): Promise<ActionResult<ImportOutcome>> {
  const access = await getAccess();
  if (!access?.school) return failure("errors.not_authenticated");
  if (!isImportKind(kind)) return failure("errors.invalid");
  const config = IMPORT_CONFIG[kind];
  if (!can(access, config.permission)) return failure("errors.forbidden");

  const parsed = z.array(z.record(z.string(), z.unknown())).min(1, "errors.empty_import").max(config.maxRows, "errors.import_too_large").safeParse(rows);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message.startsWith("errors.") ? parsed.error.issues[0].message : "errors.invalid");

  const clean = parsed.data.map((row) =>
    Object.fromEntries(config.columns.map((column) => [column, typeof row[column] === "string" ? (row[column] as string).trim().slice(0, 500) : ""]))
  );

  const supabase = await createClient();
  const rpc = kind === "students" ? "import_students" : kind === "staff" ? "import_staff" : "import_classes";
  const { data, error } = await supabase.rpc(rpc, { p_rows: clean, p_dry_run: dryRun });
  if (error) return mapDbError(error);
  const outcome = outcomeSchema.safeParse(data);
  if (!outcome.success) return failure("errors.unexpected");
  if (!dryRun && outcome.data.created > 0) revalidatePath(config.returnTo, "layout");
  return success(undefined, outcome.data);
}
