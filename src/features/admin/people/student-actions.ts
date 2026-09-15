"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, formDataToObject, parseInput, success, type FormState } from "@/lib/actions/result";
import { can, getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { GUARDIAN_RELATIONSHIPS, guardianSchema, STUDENT_STATUSES, studentSchema } from "@/features/admin/people/schemas";
import { generateInvitationCode } from "@/features/admin/people/invitation-code";

const uuid = z.string().uuid();

export async function createStudentAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "students.create")) return done(failure("errors.forbidden"));
  const input = parseInput(studentSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const v = input.data;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("students")
    .insert({
      school_id: access.school.id,
      last_name: v.lastName,
      first_name: v.firstName,
      middle_name: v.middleName,
      gender: v.gender,
      date_of_birth: v.dateOfBirth,
      student_number: v.studentNumber,
      admission_date: v.admissionDate,
      phone: v.phone,
      address: v.address,
      notes: v.notes,
    })
    .select("id")
    .single();
  if (error || !data) return done(error?.code === "23505" ? failure("errors.validation", { studentNumber: ["validation.duplicateNumber"] }) : mapDbError(error));

  if (v.classId && can(access, "enrollments.manage")) {
    const { data: klass } = await supabase.from("classes").select("academic_year_id").eq("id", v.classId).maybeSingle();
    if (klass) {
      const { error: enrollError } = await supabase.from("enrollments").insert({
        school_id: access.school.id,
        student_id: data.id,
        class_id: v.classId,
        academic_year_id: klass.academic_year_id,
        enrolled_on: v.admissionDate ?? undefined,
      });
      if (enrollError) return done(mapDbError(enrollError));
    }
  }
  revalidatePath("/admin/students");
  redirect(`/admin/students/${data.id}?saved=created`);
}

export async function updateStudentAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return done(failure("errors.invalid"));
  const input = parseInput(studentSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const v = input.data;
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("students")
    .update(
      {
        last_name: v.lastName,
        first_name: v.firstName,
        middle_name: v.middleName,
        gender: v.gender,
        date_of_birth: v.dateOfBirth,
        student_number: v.studentNumber,
        admission_date: v.admissionDate,
        phone: v.phone,
        address: v.address,
        notes: v.notes,
      },
      { count: "exact" }
    )
    .eq("id", id.data);
  if (error) return done(error.code === "23505" ? failure("errors.validation", { studentNumber: ["validation.duplicateNumber"] }) : mapDbError(error));
  if (!count) return done(failure("errors.forbidden"));
  revalidatePath(`/admin/students/${id.data}`);
  revalidatePath("/admin/students");
  return done(success("common.saved"));
}

export async function transferStudentAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const parsed = z
    .object({ studentId: uuid, classId: uuid, reason: z.string().trim().max(500).optional() })
    .safeParse({ studentId: formData.get("studentId"), classId: formData.get("classId"), reason: formData.get("reason") ?? undefined });
  if (!parsed.success) return done(failure("errors.validation", { classId: ["validation.required"] }));
  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_student_class", {
    p_student_id: parsed.data.studentId,
    p_to_class_id: parsed.data.classId,
    p_reason: parsed.data.reason || undefined,
  });
  if (error) return done(mapDbError(error));
  revalidatePath(`/admin/students/${parsed.data.studentId}`);
  revalidatePath("/admin/classes", "layout");
  return done(success("admin.students.transferred"));
}

export async function changeStudentStatusAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const parsed = z
    .object({
      studentIds: z.array(uuid).min(1).max(1000),
      status: z.enum(STUDENT_STATUSES),
      effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
      reason: z.string().trim().max(500).optional(),
    })
    .safeParse({
      studentIds: formData.getAll("studentId"),
      status: formData.get("status"),
      effectiveDate: formData.get("effectiveDate") ?? "",
      reason: formData.get("reason") ?? undefined,
    });
  if (!parsed.success) return done(failure("errors.invalid"));
  if (parsed.data.status !== "active" && !parsed.data.reason) return done(failure("errors.validation", { reason: ["validation.required"] }));
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_student_status", {
    p_student_ids: parsed.data.studentIds,
    p_status: parsed.data.status,
    p_effective_date: parsed.data.effectiveDate || undefined,
    p_reason: parsed.data.reason || undefined,
  });
  if (error) return done(mapDbError(error));
  for (const id of parsed.data.studentIds.slice(0, 20)) revalidatePath(`/admin/students/${id}`);
  revalidatePath("/admin/students");
  return done(success("admin.students.statusChanged"));
}

/** Links an existing guardian, or creates a new guardian record, to a student. */
export async function linkGuardianAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "guardians.manage")) return done(failure("errors.forbidden"));
  const base = z
    .object({
      studentId: uuid,
      guardianId: uuid.optional().or(z.literal("")).transform((v) => v || null),
      relationship: z.enum(GUARDIAN_RELATIONSHIPS),
      isPrimary: z.string().optional().transform((v) => v === "on"),
    })
    .safeParse({
      studentId: formData.get("studentId"),
      guardianId: formData.get("guardianId") ?? "",
      relationship: formData.get("relationship"),
      isPrimary: formData.get("isPrimary") ?? undefined,
    });
  if (!base.success) return done(failure("errors.invalid"));
  const supabase = await createClient();

  let guardianId = base.data.guardianId;
  if (!guardianId) {
    const input = parseInput(guardianSchema, formDataToObject(formData));
    if (!input.ok) return done(input.result);
    const g = input.data;
    const { data, error } = await supabase
      .from("guardians")
      .insert({ school_id: access.school.id, last_name: g.lastName, first_name: g.firstName, middle_name: g.middleName, phone: g.phone, email: g.email, address: g.address })
      .select("id")
      .single();
    if (error || !data) return done(mapDbError(error));
    guardianId = data.id;
  }

  const { error } = await supabase.from("student_guardians").insert({
    student_id: base.data.studentId,
    guardian_id: guardianId,
    school_id: access.school.id,
    relationship: base.data.relationship,
    is_primary: base.data.isPrimary,
  });
  if (error) return done(error.code === "23505" ? failure("admin.students.guardianAlreadyLinked") : mapDbError(error));
  revalidatePath(`/admin/students/${base.data.studentId}`);
  revalidatePath("/admin/guardians");
  return done(success("admin.students.guardianLinked"));
}

export async function unlinkGuardianAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const parsed = z.object({ studentId: uuid, guardianId: uuid }).safeParse({ studentId: formData.get("studentId"), guardianId: formData.get("guardianId") });
  if (!parsed.success) return done(failure("errors.invalid"));
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("student_guardians")
    .delete({ count: "exact" })
    .eq("student_id", parsed.data.studentId)
    .eq("guardian_id", parsed.data.guardianId);
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("errors.forbidden"));
  revalidatePath(`/admin/students/${parsed.data.studentId}`);
  return done(success("admin.students.guardianUnlinked"));
}

/**
 * Issues a single-use personal invitation code that lets the person register
 * an account already linked to their school record.
 */
export async function createPersonInvitationAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "invitations.manage")) return done(failure("errors.forbidden"));
  const parsed = z
    .object({ personType: z.enum(["student", "staff", "guardian"]), personId: uuid, roleSlug: z.string().regex(/^[a-z_]+$/), returnTo: z.string().regex(/^\/admin\/[a-z0-9/_-]+$/) })
    .safeParse({ personType: formData.get("personType"), personId: formData.get("personId"), roleSlug: formData.get("roleSlug"), returnTo: formData.get("returnTo") });
  if (!parsed.success) return done(failure("errors.invalid"));
  const supabase = await createClient();
  const { data: role } = await supabase.from("roles").select("id").eq("school_id", access.school.id).eq("slug", parsed.data.roleSlug).maybeSingle();
  if (!role) return done(failure("errors.invalid_role"));

  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error } = await supabase.from("invitation_codes").insert({
      school_id: access.school.id,
      role_id: role.id,
      code: generateInvitationCode(),
      max_uses: 1,
      expires_at: expires,
      created_by: access.userId,
      person_type: parsed.data.personType,
      person_id: parsed.data.personId,
    });
    if (!error) {
      revalidatePath(parsed.data.returnTo);
      revalidatePath("/admin/invitations");
      return done(success("admin.invitations.created"));
    }
    if (error.code !== "23505") return done(mapDbError(error));
  }
  return done(failure("errors.unexpected"));
}
