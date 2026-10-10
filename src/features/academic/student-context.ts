import "server-only";
import { notFound } from "next/navigation";
import { hasRole, type Access } from "@/lib/auth/access";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";
import { getMyChildren, getMyStudentId, type ChildSummary } from "@/features/academic/queries";

export interface StudentContext {
  studentId: string;
  firstName: string;
  lastName: string;
  classId: string | null;
  className: string | null;
  academicYearId: string | null;
  /** Children the guardian can switch between (empty for students). */
  children: ChildSummary[];
  viewer: "student" | "guardian";
}

/**
 * Resolves whose academic records a page shows. A guardian may pass
 * ?child=<student id>, which must be one of their own linked children;
 * RLS enforces the same rule in the database.
 */
export async function resolveStudentContext(access: Access, params: SearchParams): Promise<StudentContext | null> {
  const supabase = await createClient();
  let studentId: string | null = null;
  let children: ChildSummary[] = [];
  let viewer: StudentContext["viewer"] = "student";

  if (hasRole(access, "student")) {
    studentId = await getMyStudentId(access.userId);
  }
  if (!studentId && hasRole(access, "parent")) {
    viewer = "guardian";
    children = await getMyChildren();
    const requested = firstValue(params.child);
    if (requested && !children.some((c) => c.id === requested)) notFound();
    studentId = requested ?? children[0]?.id ?? null;
  }
  if (!studentId) return null;

  const [{ data: student }, { data: enrollment }] = await Promise.all([
    supabase.from("students").select("id, first_name, last_name").eq("id", studentId).maybeSingle(),
    supabase
      .from("enrollments")
      .select("class_id, academic_year_id, classes(name), academic_years!inner(is_current)")
      .eq("student_id", studentId)
      .eq("status", "active")
      .eq("academic_years.is_current", true)
      .maybeSingle(),
  ]);
  if (!student) return null;

  return {
    studentId: student.id,
    firstName: student.first_name,
    lastName: student.last_name,
    classId: enrollment?.class_id ?? null,
    className: (enrollment?.classes as { name: string } | null)?.name ?? null,
    academicYearId: enrollment?.academic_year_id ?? null,
    children,
    viewer,
  };
}
