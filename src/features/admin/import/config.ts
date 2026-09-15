import type { Permission } from "@/lib/auth/permissions";

export type ImportKind = "students" | "staff" | "classes";

export interface ImportConfig {
  columns: readonly string[];
  required: readonly string[];
  permission: Permission;
  maxRows: number;
  returnTo: string;
}

/** Canonical CSV columns accepted by the database import functions (migration 00025). */
export const IMPORT_CONFIG: Record<ImportKind, ImportConfig> = {
  students: {
    columns: ["last_name", "first_name", "middle_name", "gender", "date_of_birth", "student_number", "class_name", "admission_date", "phone", "address"],
    required: ["last_name", "first_name"],
    permission: "students.import",
    maxRows: 2000,
    returnTo: "/admin/students",
  },
  staff: {
    columns: ["last_name", "first_name", "middle_name", "gender", "staff_type", "position", "employee_number", "phone", "email", "hire_date"],
    required: ["last_name", "first_name"],
    permission: "staff.create",
    maxRows: 1000,
    returnTo: "/admin/staff",
  },
  classes: {
    columns: ["name", "grade_level", "shift", "capacity", "homeroom_employee_number"],
    required: ["name", "grade_level"],
    permission: "classes.create",
    maxRows: 300,
    returnTo: "/admin/classes",
  },
};

export function isImportKind(value: string): value is ImportKind {
  return value in IMPORT_CONFIG;
}

export interface ImportIssue {
  row: number;
  field: string;
  code: string;
}

export interface ImportOutcome {
  valid: boolean;
  total: number;
  created: number;
  errors: ImportIssue[];
}
