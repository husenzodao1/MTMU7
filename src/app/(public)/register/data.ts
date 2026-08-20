"use server";

import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_SCHOOL_ID = "00000000-0000-0000-0000-000000000001";

export async function getAvailableRoles(): Promise<
  Array<{ id: string; slug: string; nameTg: string; nameRu: string | null; level: number }>
> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("roles" as never)
    .select("id, slug, name_tg, name_ru, level" as never)
    .eq("school_id" as never, DEFAULT_SCHOOL_ID)
    .eq("is_active" as never, true)
    .gt("level" as never, 3)
    .order("level" as never, { ascending: true });

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    nameTg: r.name_tg as string,
    nameRu: (r.name_ru as string) ?? null,
    level: r.level as number,
  }));
}

export async function getAvailableClasses(): Promise<
  Array<{ id: string; name: string; gradeLevel: number }>
> {
  const supabase = createAdminClient();

  const { data: currentYear } = await supabase
    .from("academic_years" as never)
    .select("id" as never)
    .eq("school_id" as never, DEFAULT_SCHOOL_ID)
    .eq("is_current" as never, true)
    .single();

  if (!currentYear) return [];

  const yearRow = currentYear as Record<string, unknown>;

  const { data } = await supabase
    .from("classes" as never)
    .select("id, name, grade_level" as never)
    .eq("school_id" as never, DEFAULT_SCHOOL_ID)
    .eq("academic_year_id" as never, yearRow.id as string)
    .eq("is_active" as never, true)
    .order("grade_level" as never, { ascending: true })
    .order("name" as never, { ascending: true });

  return ((data ?? []) as Array<Record<string, unknown>>).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    gradeLevel: c.grade_level as number,
  }));
}

export async function getAvailableSubjects(): Promise<
  Array<{ id: string; nameTg: string; nameRu: string | null }>
> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("subjects" as never)
    .select("id, name_tg, name_ru" as never)
    .eq("school_id" as never, DEFAULT_SCHOOL_ID)
    .eq("is_active" as never, true)
    .order("name_tg" as never, { ascending: true });

  return ((data ?? []) as Array<Record<string, unknown>>).map((s) => ({
    id: s.id as string,
    nameTg: s.name_tg as string,
    nameRu: (s.name_ru as string) ?? null,
  }));
}
