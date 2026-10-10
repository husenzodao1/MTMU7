/**
 * The parents written beside the youngest pupils in the register workbook.
 *
 * Below the grade the school sets (1–4 by default) a pupil is not added
 * without a parent, in the workbook as on the form. import_people knows
 * nothing of parents, so this is where those rows are checked; the parents
 * themselves are written after the pupils, by import_guardians.
 *
 * Pure, so it can be tested without a workbook.
 */

export interface RowIssue {
  row: number;
  field: string;
  code: string;
}

const PHONE = /^[+0-9 ()-]{5,30}$/;

export function gradeOf(className: string | undefined): number | null {
  const match = /^\s*(\d{1,2})/.exec(className ?? "");
  return match ? Number(match[1]) : null;
}

export function guardianIssues(rows: Array<Record<string, string>>, requiredMaxGrade: number): RowIssue[] {
  const issues: RowIssue[] = [];
  rows.forEach((row, index) => {
    const number = index + 1;
    const name = (row.guardian_name ?? "").trim();
    const phone = (row.guardian_phone ?? "").trim();
    const digits = phone.replace(/\D/g, "");
    const grade = gradeOf(row.class_name);
    if (grade !== null && grade <= requiredMaxGrade && (!name || !digits)) {
      issues.push({ row: number, field: name ? "guardian_phone" : "guardian_name", code: "guardian_required" });
      return;
    }
    if (phone && (!PHONE.test(phone) || digits.length < 5)) {
      issues.push({ row: number, field: "guardian_phone", code: "invalid_phone" });
    }
    if (phone && !name) {
      issues.push({ row: number, field: "guardian_name", code: "required" });
    }
  });
  return issues;
}
