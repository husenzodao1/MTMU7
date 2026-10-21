import "server-only";
import type { createClient } from "@/lib/supabase/server";

export interface RowIssue {
  row: number;
  field: string;
  code: string;
}

/**
 * Telephone numbers in a people workbook that are in it twice, or already on
 * an account the row is not about (import_phone_conflicts, 00077). Checked
 * before the preview answers and again before anything is written, so the
 * office sees the row instead of an import that stops half-way.
 */
export async function phoneConflicts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Array<Record<string, string>>
): Promise<RowIssue[]> {
  if (!rows.some((row) => (row.phone ?? "").trim() !== "")) return [];
  const { data, error } = await supabase.rpc("import_phone_conflicts", {
    // The names, the date of birth and the teacher's number let the database
    // recognise the person a row is about (00088), so a workbook imported
    // again does not clash with its own numbers.
    p_rows: rows.map((row) => ({
      phone: row.phone ?? "",
      login: row.login ?? "",
      email: row.email ?? "",
      last_name: row.last_name ?? "",
      first_name: row.first_name ?? "",
      date_of_birth: row.date_of_birth ?? "",
      employee_number: row.employee_number ?? "",
    })),
  });
  if (error || !Array.isArray(data)) return [];
  return (data as unknown as RowIssue[]).map((issue) => ({ ...issue, code: issue.code === "duplicate_existing" ? "phone_taken" : issue.code }));
}
