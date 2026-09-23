import "server-only";
import { cache } from "react";
import { pickName, type Locale } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";

export interface ClassSubjectContext {
  id: string;
  classId: string;
  className: string;
  academicYearId: string;
  subjectName: string;
  teacherId: string | null;
}

type Named = { name_tg: string; name_ru: string | null; name_en: string | null };

export const getClassSubjectContext = cache(async (id: string, locale: Locale): Promise<ClassSubjectContext | null> => {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("class_subjects")
    .select("id, class_id, teacher_id, classes(name, academic_year_id), subjects(name_tg, name_ru, name_en)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const klass = data.classes as { name: string; academic_year_id: string } | null;
  const subject = data.subjects as Named | null;
  if (!klass || !subject) return null;
  return {
    id: data.id,
    classId: data.class_id,
    className: klass.name,
    academicYearId: klass.academic_year_id,
    subjectName: pickName(subject, locale),
    teacherId: data.teacher_id,
  };
});

export const getClassContext = cache(async (id: string) => {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("classes").select("id, name, academic_year_id, homeroom_staff_id").eq("id", id).maybeSingle();
  return data;
});

export interface RosterStudent {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  studentNumber: string | null;
}

/** Students enrolled in the class during [from, to] (inclusive), ordered by name. */
export async function getRoster(classId: string, from: string, to: string = from): Promise<RosterStudent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("enrollments")
    .select("student_id, enrolled_on, left_on, students(id, first_name, last_name, middle_name, student_number)")
    .eq("class_id", classId)
    .lte("enrolled_on", to)
    .or(`left_on.is.null,left_on.gte.${from}`)
    .limit(200);
  const seen = new Set<string>();
  const roster: RosterStudent[] = [];
  for (const row of data ?? []) {
    const s = row.students as { id: string; first_name: string; last_name: string; middle_name: string | null; student_number: string | null } | null;
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    roster.push({ id: s.id, firstName: s.first_name, lastName: s.last_name, middleName: s.middle_name, studentNumber: s.student_number });
  }
  return roster.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
}

export interface TeachingClassSubject {
  id: string;
  label: string;
  classId: string;
}

/** Class subjects the signed-in teacher is assigned to in the current academic year. */
export const getMyClassSubjects = cache(async (userId: string, locale: Locale): Promise<TeachingClassSubject[]> => {
  const supabase = await createClient();
  const { data: staff } = await supabase.from("staff").select("id").eq("user_id", userId).maybeSingle();
  if (!staff) return [];
  const { data } = await supabase
    .from("class_subjects")
    .select("id, class_id, classes!inner(name, grade_level, is_active, academic_years!inner(is_current)), subjects(name_tg, name_ru, name_en)")
    .eq("teacher_id", staff.id)
    .eq("is_active", true)
    .eq("classes.is_active", true)
    .eq("classes.academic_years.is_current", true);
  return (data ?? [])
    .map((row) => {
      const klass = row.classes as unknown as { name: string; grade_level: number };
      const subject = row.subjects as Named | null;
      return { id: row.id, classId: row.class_id, label: `${klass.name} · ${subject ? pickName(subject, locale) : ""}`, grade: klass.grade_level };
    })
    .sort((a, b) => a.grade - b.grade || a.label.localeCompare(b.label))
    .map(({ id, classId, label }) => ({ id, classId, label }));
});

export const getTermsForYear = cache(async (academicYearId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("academic_terms")
    .select("id, name, kind, start_date, end_date, is_locked")
    .eq("academic_year_id", academicYearId)
    .in("kind", ["quarter", "semester", "trimester", "term"])
    .order("start_date");
  return data ?? [];
});

/**
 * Every class subject in the school, for whoever may inspect the journals — a
 * director checking that the term was filled in, or an administrator answering
 * a parent. Row-level security still decides what comes back: someone without
 * the school-wide right simply receives their own.
 */
export const getSchoolClassSubjects = cache(async (locale: Locale): Promise<TeachingClassSubject[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("class_subjects")
    .select("id, class_id, classes!inner(name, grade_level, is_active, academic_years!inner(is_current)), subjects(name_tg, name_ru, name_en), staff(last_name, first_name, employee_number)")
    .eq("is_active", true)
    .eq("classes.is_active", true)
    .eq("classes.academic_years.is_current", true)
    .limit(500);
  return (data ?? [])
    .map((row) => {
      const klass = row.classes as unknown as { name: string; grade_level: number };
      const subject = row.subjects as Named | null;
      const teacher = row.staff as unknown as { last_name: string; first_name: string; employee_number: string | null } | null;
      const who = teacher ? ` · ${teacher.last_name} ${teacher.first_name[0] ?? ""}.${teacher.employee_number ? ` (${teacher.employee_number})` : ""}` : "";
      return {
        id: row.id,
        classId: row.class_id,
        label: `${klass.name} · ${subject ? pickName(subject, locale) : ""}${who}`,
        grade: klass.grade_level,
      };
    })
    .sort((a, b) => a.grade - b.grade || a.label.localeCompare(b.label))
    .map(({ id, classId, label }) => ({ id, classId, label }));
});
