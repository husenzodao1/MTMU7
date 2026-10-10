"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { uuid } from "@/lib/validation/uuid";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, formDataToObject, parseInput, success, type FormState } from "@/lib/actions/result";
import { can, getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { guardianSchema, STAFF_STATUSES, staffSchema } from "@/features/admin/people/schemas";


function staffRow(v: z.output<typeof staffSchema>) {
  return {
    last_name: v.lastName,
    first_name: v.firstName,
    middle_name: v.middleName,
    gender: v.gender,
    date_of_birth: v.dateOfBirth,
    staff_type: v.staffType,
    position: v.position,
    qualification: v.qualification,
    employee_number: v.employeeNumber,
    hire_date: v.hireDate,
    phone: v.phone,
    email: v.email,
    max_weekly_hours: v.maxWeeklyHours,
  };
}

const duplicateNumber = () => failure("errors.validation", { employeeNumber: ["validation.duplicateNumber"] });

export async function createStaffAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "staff.create")) return done(failure("errors.forbidden"));
  const input = parseInput(staffSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const supabase = await createClient();
  const { data, error } = await supabase.from("staff").insert({ ...staffRow(input.data), school_id: access.school.id }).select("id").single();
  if (error || !data) return done(error?.code === "23505" ? duplicateNumber() : mapDbError(error));
  revalidatePath("/admin/staff");
  redirect(`/admin/staff/${data.id}?saved=created`);
}

export async function updateStaffAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return done(failure("errors.invalid"));
  const input = parseInput(staffSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const supabase = await createClient();
  const { error, count } = await supabase.from("staff").update(staffRow(input.data), { count: "exact" }).eq("id", id.data);
  if (error) return done(error.code === "23505" ? duplicateNumber() : mapDbError(error));
  if (!count) return done(failure("errors.forbidden"));
  revalidatePath(`/admin/staff/${id.data}`);
  revalidatePath("/admin/staff");
  return done(success("common.saved"));
}

export async function setStaffStatusAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "staff.archive")) return done(failure("errors.forbidden"));
  const parsed = z.object({ id: uuid, status: z.enum(STAFF_STATUSES) }).safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) return done(failure("errors.invalid"));
  const supabase = await createClient();
  const { error, count } = await supabase.from("staff").update({ status: parsed.data.status }, { count: "exact" }).eq("id", parsed.data.id);
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("errors.forbidden"));
  revalidatePath(`/admin/staff/${parsed.data.id}`);
  revalidatePath("/admin/staff");
  return done(success("admin.staff.statusChanged"));
}

export async function saveGuardianAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "guardians.manage")) return done(failure("errors.forbidden"));
  const id = uuid.optional().or(z.literal("")).safeParse(formData.get("id") ?? "");
  if (!id.success) return done(failure("errors.invalid"));
  const input = parseInput(guardianSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const g = input.data;
  const row = { last_name: g.lastName, first_name: g.firstName, middle_name: g.middleName, phone: g.phone, email: g.email, address: g.address };
  const supabase = await createClient();
  const { error } = id.data
    ? await supabase.from("guardians").update(row).eq("id", id.data)
    : await supabase.from("guardians").insert({ ...row, school_id: access.school.id });
  if (error) return done(mapDbError(error));
  revalidatePath("/admin/guardians");
  return done(success(id.data ? "common.saved" : "common.created"));
}

export async function setGuardianStatusAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const parsed = z.object({ id: uuid, status: z.enum(["active", "archived"]) }).safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) return done(failure("errors.invalid"));
  const supabase = await createClient();
  const { error, count } = await supabase.from("guardians").update({ status: parsed.data.status }, { count: "exact" }).eq("id", parsed.data.id);
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("errors.forbidden"));
  revalidatePath("/admin/guardians");
  return done(success(parsed.data.status === "archived" ? "common.archived" : "common.saved"));
}
