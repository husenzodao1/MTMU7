import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getCurrentYear = cache(async (schoolId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("academic_years")
    .select("id, name, start_date, end_date")
    .eq("school_id", schoolId)
    .eq("is_current", true)
    .maybeSingle();
  return data;
});

/** Active classes of an academic year (default: current), ordered by grade and name. */
export const getClassOptions = cache(async (schoolId: string, academicYearId?: string) => {
  const supabase = await createClient();
  const yearId = academicYearId ?? (await getCurrentYear(schoolId))?.id;
  if (!yearId) return [];
  const { data } = await supabase
    .from("classes")
    .select("id, name, grade_level")
    .eq("school_id", schoolId)
    .eq("academic_year_id", yearId)
    .eq("is_active", true)
    .order("grade_level")
    .order("name");
  return (data ?? []).map((c) => ({ value: c.id, label: c.name, grade: c.grade_level }));
});

export const getStaffOptions = cache(async (schoolId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff")
    .select("id, last_name, first_name, middle_name, staff_type")
    .eq("school_id", schoolId)
    .in("status", ["active", "on_leave"])
    .order("last_name")
    .limit(1000);
  return (data ?? []).map((s) => ({ value: s.id, label: [s.last_name, s.first_name, s.middle_name].filter(Boolean).join(" "), type: s.staff_type }));
});

export function fullName(p: { last_name: string; first_name: string; middle_name?: string | null }): string {
  return [p.last_name, p.first_name, p.middle_name].filter(Boolean).join(" ");
}
