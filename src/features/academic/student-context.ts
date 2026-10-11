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
  /** Every school year the pupil was in a class, newest first, for a year switcher. */
  years: Array<{ id: string; name: string; className: string | null; current: boolean; start: string; end: string }>;
  /** True when ?year= chose a year that is not the current one. */
  pastYear: boolean;
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

  const [{ data: student }, { data: enrollments }] = await Promise.all([
    supabase.from("students").select("id, first_name, last_name").eq("id", studentId).maybeSingle(),
    supabase
      .from("enrollments")
      .select("class_id, academic_year_id, status, classes(name), academic_years!inner(name, is_current, start_date, end_date)")
      .eq("student_id", studentId)
      .in("status", ["active", "completed", "transferred"]),
  ]);
  if (!student) return null;

  // One entry per year, the active enrolment winning over an older one.
  const byYear = new Map<string, NonNullable<typeof enrollments>[number]>();
  for (const e of enrollments ?? []) {
    // This year counts only while the pupil is still in the class.
    if ((e.academic_years as { is_current: boolean }).is_current && e.status !== "active") continue;
    const seen = byYear.get(e.academic_year_id);
    if (!seen || (e.status === "active" && seen.status !== "active")) byYear.set(e.academic_year_id, e);
  }
  const years = [...byYear.values()]
    .map((e) => {
      const year = e.academic_years as { name: string; is_current: boolean; start_date: string; end_date: string };
      return {
        id: e.academic_year_id,
        name: year.name,
        className: (e.classes as { name: string } | null)?.name ?? null,
        current: year.is_current,
        start: year.start_date,
        end: year.end_date,
        classId: e.class_id,
      };
    })
    .sort((a, b) => b.start.localeCompare(a.start));

  const requestedYear = firstValue(params.year);
  const chosen = years.find((y) => y.id === requestedYear) ?? years.find((y) => y.current) ?? null;

  return {
    studentId: student.id,
    firstName: student.first_name,
    lastName: student.last_name,
    classId: chosen?.classId ?? null,
    className: chosen?.className ?? null,
    academicYearId: chosen?.id ?? null,
    years: years.map((y) => ({ id: y.id, name: y.name, className: y.className, current: y.current, start: y.start, end: y.end })),
    pastYear: Boolean(chosen && !chosen.current),
    children,
    viewer,
  };
}
