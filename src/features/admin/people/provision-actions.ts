"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/lib/validation/uuid";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, formDataToObject, keepValues, parseInput, success, type FormState } from "@/lib/actions/result";
import { can, getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { STAFF_TYPES } from "@/features/admin/people/schemas";

/**
 * Adding one person and handing over their login.
 *
 * Since the school issues logins rather than waiting for people to ask for one,
 * "add a pupil" has to mean "add a pupil who can sign in" — a person record on
 * its own is a dead end nobody can reach. Both actions therefore go through the
 * same database function the workbook import uses, so one row typed into a form
 * and one row in a spreadsheet are validated, matched and written identically.
 *
 * The password comes back once, in the result, and is shown once. It is not
 * stored, so the screen that displays it is the only copy there will ever be.
 */

export interface IssuedCredentials {
  login: string;
  /** Absent when the person was already on the register: theirs is not reissued. */
  password: string | null;
  userId: string;
  personId: string | null;
  created: number;
}

interface RowErrors {
  valid: boolean;
  errors: Array<{ row: number; field: string; code: string }>;
  login?: string;
  password?: string | null;
  userId?: string;
  personId?: string | null;
  created?: number;
}

const name = z.string().trim().min(1, "validation.required").max(100, "validation.too_big");
const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => v || "");
const email = z.string().trim().toLowerCase().max(254).email("validation.email");
const roleId = uuid.optional().or(z.literal("")).transform((v) => v || undefined);

const newStudentSchema = z.object({
  lastName: name,
  firstName: name,
  middleName: optional(100),
  className: z.string().trim().min(1, "validation.required").max(20),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "validation.date"),
  gender: optional(16),
  email,
  phone: optional(50),
  roleId,
});

const newStaffSchema = z.object({
  lastName: name,
  firstName: name,
  middleName: optional(100),
  employeeNumber: z.string().trim().min(1, "validation.required").max(32).regex(/^[A-Za-z0-9-]+$/, "validation.employeeNumber"),
  staffType: z.enum(STAFF_TYPES),
  positionTitle: optional(200),
  qualification: optional(2000),
  hireDate: optional(10),
  maxWeeklyHours: optional(8),
  dateOfBirth: optional(10),
  gender: optional(16),
  email,
  phone: optional(50),
  roleId,
});

/** The Tajik word the importer reads a post from, for each staff_type. */
const POSITION_WORD: Record<string, string> = {
  teacher: "омӯзгор",
  director: "директор",
  vice_principal: "муовини директор",
  librarian: "китобдор",
  administrator: "омӯзгор",
  support: "омӯзгор",
  other: "омӯзгор",
};

async function provision(kind: "students" | "staff", row: Record<string, string>, role: string | undefined) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("provision_person", { p_kind: kind, p_row: row, p_role_id: role ?? undefined });
  if (error) return { error: mapDbError(error) };
  return { outcome: data as unknown as RowErrors };
}

/** Row errors become field errors, so each one lands on the input that caused it. */
function fieldErrors(outcome: RowErrors, map: Record<string, string>): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of outcome.errors ?? []) {
    const field = map[issue.field] ?? issue.field;
    errors[field] = [...(errors[field] ?? []), `admin.import.codes.${issue.code}`];
  }
  return errors;
}

const STUDENT_FIELDS = {
  class_name: "className",
  last_name: "lastName",
  first_name: "firstName",
  middle_name: "middleName",
  date_of_birth: "dateOfBirth",
  email: "email",
  phone: "phone",
  gender: "gender",
};

const STAFF_FIELDS = {
  employee_number: "employeeNumber",
  last_name: "lastName",
  first_name: "firstName",
  middle_name: "middleName",
  position: "staffType",
  email: "email",
  phone: "phone",
  gender: "gender",
  homeroom_class: "homeroomClass",
};

export async function addStudentAction(_state: FormState<IssuedCredentials>, formData: FormData): Promise<FormState<IssuedCredentials>> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "students.create")) return done(failure("errors.forbidden"));

  const kept = keepValues(formData);
  const input = parseInput(newStudentSchema, formDataToObject(formData), kept);
  if (!input.ok) return done(input.result);
  const v = input.data;

  const { error, outcome } = await provision(
    "students",
    {
      class_name: v.className,
      last_name: v.lastName,
      first_name: v.firstName,
      middle_name: v.middleName,
      date_of_birth: v.dateOfBirth,
      gender: v.gender,
      email: v.email,
      phone: v.phone,
    },
    v.roleId
  );
  if (error) return done(error);
  if (!outcome?.valid) return done(failure("errors.validation", fieldErrors(outcome!, STUDENT_FIELDS), kept));

  revalidatePath("/admin/students");
  return done(success("admin.people.accountIssued", {
    login: outcome.login!,
    password: outcome.password ?? null,
    userId: outcome.userId!,
    personId: outcome.personId ?? null,
    created: outcome.created ?? 0,
  }));
}

export async function addStaffAction(_state: FormState<IssuedCredentials>, formData: FormData): Promise<FormState<IssuedCredentials>> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "staff.create")) return done(failure("errors.forbidden"));

  const kept = keepValues(formData);
  const input = parseInput(newStaffSchema, formDataToObject(formData), kept);
  if (!input.ok) return done(input.result);
  const v = input.data;

  const { error, outcome } = await provision(
    "staff",
    {
      employee_number: v.employeeNumber,
      last_name: v.lastName,
      first_name: v.firstName,
      middle_name: v.middleName,
      // The importer reads the post from a Tajik word; the form offers the
      // staff types the schema knows, so one is translated into the other here
      // rather than teaching the importer a second vocabulary.
      position: POSITION_WORD[v.staffType] ?? "омӯзгор",
      date_of_birth: v.dateOfBirth,
      gender: v.gender,
      email: v.email,
      phone: v.phone,
      position_title: v.positionTitle,
      qualification: v.qualification,
      hire_date: v.hireDate,
      max_weekly_hours: v.maxWeeklyHours,
    },
    v.roleId
  );
  if (error) return done(error);
  if (!outcome?.valid) return done(failure("errors.validation", fieldErrors(outcome!, STAFF_FIELDS), kept));

  revalidatePath("/admin/staff");
  return done(success("admin.people.accountIssued", {
    login: outcome.login!,
    password: outcome.password ?? null,
    userId: outcome.userId!,
    personId: outcome.personId ?? null,
    created: outcome.created ?? 0,
  }));
}
