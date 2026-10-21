import "server-only";
import { cache } from "react";
import type { Access } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { getClassOptions } from "@/features/admin/queries";
import type { AccountCategory, AccountDetails, AccountDirectory } from "@/features/accounts/types";
import type { ClassOption } from "@/features/accounts/account-form";

export const PAGE_SIZE = 40;

export async function loadDirectory(options: {
  category: AccountCategory;
  query: string;
  classId: string | null;
  page: number;
  pageSize?: number;
}): Promise<AccountDirectory | null> {
  const supabase = await createClient();
  const size = options.pageSize ?? PAGE_SIZE;
  const { data, error } = await supabase.rpc("account_directory", {
    p_category: options.category,
    p_query: options.query || undefined,
    p_class_id: options.classId ?? undefined,
    // Every page so far: the directory grows as it is scrolled (ui/pagination.tsx).
    p_limit: Math.min(500, size * Math.max(1, options.page)),
    p_offset: 0,
  });
  if (error || !data) return null;
  return data as unknown as AccountDirectory;
}

export async function loadDetails(userId: string): Promise<AccountDetails | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("account_details", { p_user_id: userId });
  if (error || !data) return null;
  return data as unknown as AccountDetails;
}

/** The classes the caller leads this year: what a homeroom teacher may add pupils to. */
export const myHomeroomClasses = cache(async (access: Access): Promise<ClassOption[]> => {
  const supabase = await createClient();
  const { data: staff } = await supabase.from("staff").select("id").eq("user_id", access.userId).maybeSingle();
  if (!staff) return [];
  const all = await getClassOptions(access.school!.id);
  const { data: led } = await supabase.from("classes").select("id").eq("homeroom_staff_id", staff.id);
  const ids = new Set((led ?? []).map((c) => c.id));
  return all.filter((c) => ids.has(c.value));
});

/** Below these grades a pupil needs a parent, and up to them the parents run the account. */
export const gradeLimits = cache(async (schoolId: string): Promise<{ required: number; managed: number }> => {
  const supabase = await createClient();
  const { data } = await supabase.from("schools").select("settings").eq("id", schoolId).maybeSingle();
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const read = (key: string, fallback: number) => {
    const value = Number(settings[key]);
    return Number.isInteger(value) && value >= 0 && value <= 11 ? value : fallback;
  };
  return { required: read("parent_required_max_grade", 4), managed: read("parent_managed_max_grade", 5) };
});
