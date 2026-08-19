"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function createClassAction(formData: FormData) {
  const admin = await requireAdmin();
  const supabaseAdmin = createAdminClient();

  const gradeLevel = Number(formData.get("gradeLevel"));
  const letter = (formData.get("letter") as string)?.trim().toUpperCase();
  const academicYearId = formData.get("academicYearId") as string;

  if (!gradeLevel || gradeLevel < 1 || gradeLevel > 11) {
    return { error: "invalidData" };
  }
  if (!letter || letter.length > 5) {
    return { error: "invalidData" };
  }
  if (!academicYearId) {
    return { error: "invalidData" };
  }

  const name = `${gradeLevel}${letter}`;

  const { error } = await supabaseAdmin
    .from("classes" as never)
    .insert({
      school_id: admin.schoolId,
      academic_year_id: academicYearId,
      name,
      grade_level: gradeLevel,
      is_active: true,
    } as never);

  if (error) {
    if (error.code === "23505") {
      return { error: "alreadyExists" };
    }
    return { error: "createClassError" };
  }

  revalidatePath("/admin/classes");
  return { success: true };
}

export async function createAcademicYearAction(formData: FormData) {
  const admin = await requireAdmin();
  const supabaseAdmin = createAdminClient();

  const name = (formData.get("yearName") as string)?.trim();
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;

  if (!name || !startDate || !endDate) {
    return { error: "invalidData" };
  }

  const { error } = await supabaseAdmin
    .from("academic_years" as never)
    .insert({
      school_id: admin.schoolId,
      name,
      start_date: startDate,
      end_date: endDate,
      is_current: true,
    } as never);

  if (error) {
    if (error.code === "23505") {
      return { error: "alreadyExists" };
    }
    return { error: "createClassError" };
  }

  revalidatePath("/admin/classes");
  return { success: true };
}

export async function bulkCreateClassesAction(formData: FormData) {
  const admin = await requireAdmin();
  const supabaseAdmin = createAdminClient();

  const academicYearId = formData.get("academicYearId") as string;
  const gradeFrom = Number(formData.get("gradeFrom"));
  const gradeTo = Number(formData.get("gradeTo"));
  const letters = (formData.get("letters") as string)?.trim().toUpperCase().split(",").map(l => l.trim()).filter(Boolean);

  if (!academicYearId || !gradeFrom || !gradeTo || !letters.length) {
    return { error: "invalidData" };
  }
  if (gradeFrom < 1 || gradeTo > 11 || gradeFrom > gradeTo) {
    return { error: "invalidData" };
  }

  const classesToInsert = [];
  for (let grade = gradeFrom; grade <= gradeTo; grade++) {
    for (const letter of letters) {
      classesToInsert.push({
        school_id: admin.schoolId,
        academic_year_id: academicYearId,
        name: `${grade}${letter}`,
        grade_level: grade,
        is_active: true,
      });
    }
  }

  const { error } = await supabaseAdmin
    .from("classes" as never)
    .upsert(classesToInsert as never[], {
      onConflict: "school_id,academic_year_id,name",
      ignoreDuplicates: true,
    } as never);

  if (error) {
    return { error: "createClassError" };
  }

  revalidatePath("/admin/classes");
  return { success: true, count: classesToInsert.length };
}
