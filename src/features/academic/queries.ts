import "server-only";
import { cache } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const s = z.string();
const ns = z.string().nullable().optional().transform((v) => v ?? null);
const num = z.union([z.number(), z.string()]).transform((v) => Number(v));

export const lessonSchema = z.object({
  period_number: z.number(),
  shift: z.number(),
  subject_tg: s,
  subject_ru: ns,
  subject_en: ns,
  teacher: ns,
  room: ns,
  start_time: ns,
  end_time: ns,
  is_substitution: z.boolean(),
});

const studentOverviewSchema = z.object({
  student: z.object({
    id: s,
    first_name: s,
    last_name: s,
    status: s,
    class_id: ns,
    class_name: ns,
  }),
  date: s,
  lessons: z.array(lessonSchema),
  homework_due: z.array(
    z.object({
      id: s,
      title: s,
      due_at: ns,
      subject_tg: s,
      subject_ru: ns,
      subject_en: ns,
      submission_status: ns,
    })
  ),
  latest_grades: z.array(
    z.object({
      id: s,
      score: num,
      max_score: num,
      grade_date: s,
      subject_tg: s,
      subject_ru: ns,
      subject_en: ns,
      assessment_tg: s,
      assessment_ru: ns,
      assessment_en: ns,
    })
  ),
  attendance_term: z.object({ present: num, late: num, absent: num, excused: num, total: num }),
});

export type StudentOverview = z.infer<typeof studentOverviewSchema>;

export const getStudentOverview = cache(async (studentId?: string, date?: string): Promise<StudentOverview | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("student_overview", { p_student_id: studentId, p_date: date });
  if (error || !data) return null;
  const parsed = studentOverviewSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
});

const teacherTodaySchema = z.union([
  z.object({ is_teacher: z.literal(false) }),
  z.object({
    is_teacher: z.literal(true),
    date: s,
    lessons: z.array(
      z.object({
        timetable_entry_id: s,
        class_subject_id: s,
        class_id: s,
        class_name: s,
        subject_tg: s,
        subject_ru: ns,
        subject_en: ns,
        shift: z.number(),
        period_number: z.number(),
        room: ns,
        start_time: ns,
        end_time: ns,
        is_substitution: z.boolean(),
        cancelled_for_me: z.boolean(),
        attendance_marked: z.boolean(),
        students: num,
      })
    ),
    classes: z.array(z.object({ class_subject_id: s, class_id: s, class_name: s, subject_tg: s, subject_ru: ns, subject_en: ns })),
    homeroom_classes: z.array(z.object({ class_id: s, class_name: s, daily_attendance_marked: z.boolean() })),
    submissions_to_review: num,
    homework_due_soon: z.array(z.object({ id: s, title: s, due_at: ns, class_name: s })),
  }),
]);

export type TeacherToday = Extract<z.infer<typeof teacherTodaySchema>, { is_teacher: true }>;

export const getTeacherToday = cache(async (date?: string): Promise<TeacherToday | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("teacher_today", { p_date: date });
  if (error || !data) return null;
  const parsed = teacherTodaySchema.safeParse(data);
  return parsed.success && parsed.data.is_teacher ? parsed.data : null;
});

export interface ChildSummary {
  id: string;
  firstName: string;
  lastName: string;
  className: string | null;
  relationship: string | null;
}

export const getMyChildren = cache(async (): Promise<ChildSummary[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_children");
  return (data ?? [])
    .filter((c) => c.id && c.first_name && c.last_name)
    .map((c) => ({ id: c.id!, firstName: c.first_name!, lastName: c.last_name!, className: c.class_name, relationship: c.relationship }));
});

/** Student id of the signed-in user, or null. */
export const getMyStudentId = cache(async (userId: string): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("students").select("id").eq("user_id", userId).maybeSingle();
  return data?.id ?? null;
});

/** Staff id of the signed-in user, or null. */
export const getMyStaffId = cache(async (userId: string): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("staff").select("id").eq("user_id", userId).maybeSingle();
  return data?.id ?? null;
});

export const getCurrentAcademicYear = cache(async (schoolId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("academic_years")
    .select("id, name, start_date, end_date")
    .eq("school_id", schoolId)
    .eq("is_current", true)
    .maybeSingle();
  return data;
});

export const getBellPeriods = cache(async (schoolId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bell_periods")
    .select("shift, period_number, start_time, end_time")
    .eq("school_id", schoolId)
    .order("shift")
    .order("period_number");
  return data ?? [];
});
