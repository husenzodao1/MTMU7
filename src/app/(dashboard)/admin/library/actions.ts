"use server";

import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guard";
import { hasPermission } from "@/lib/permissions/check";
import { redirect } from "next/navigation";
import { z } from "zod";

const categorySchema = z.object({
  name_tg: z.string().min(1).max(200),
  name_ru: z.string().max(200).optional(),
  slug: z.string().min(1).max(100),
  parent_id: z.string().uuid().optional().or(z.literal("")),
});

export interface AdminCategory {
  id: string;
  nameTg: string;
  nameRu: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
}

export async function getAdminCategories(): Promise<AdminCategory[]> {
  const user = await requireAdmin();
  const canManage = await hasPermission("library.manage");
  if (!canManage) return [];

  const supabase = await createServerClient();

  const { data } = await supabase
    .from("library_categories" as never)
    .select("*" as never)
    .eq("school_id" as never, user.schoolId)
    .order("sort_order" as never, { ascending: true });

  if (!data) return [];

  return (data as Array<Record<string, unknown>>).map((cat) => ({
    id: cat.id as string,
    nameTg: cat.name_tg as string,
    nameRu: (cat.name_ru as string) ?? "",
    slug: cat.slug as string,
    parentId: cat.parent_id as string | null,
    sortOrder: cat.sort_order as number,
    isActive: cat.is_active as boolean,
  }));
}

export async function createCategoryAction(
  _prev: unknown,
  formData: FormData
) {
  const user = await requireAdmin();
  const canManage = await hasPermission("library.manage");
  if (!canManage) return { error: "Forbidden" };

  const raw = {
    name_tg: formData.get("name_tg"),
    name_ru: formData.get("name_ru"),
    slug: formData.get("slug"),
    parent_id: formData.get("parent_id"),
  };

  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) return { error: "Validation failed" };

  const supabase = await createServerClient();

  const { error } = await supabase
    .from("library_categories" as never)
    .insert({
      school_id: user.schoolId,
      name_tg: parsed.data.name_tg,
      name_ru: parsed.data.name_ru || null,
      slug: parsed.data.slug,
      parent_id: parsed.data.parent_id || null,
      is_active: true,
    } as never);

  if (error) return { error: error.message };

  return { success: true };
}

export async function updateCategoryAction(
  categoryId: string,
  _prev: unknown,
  formData: FormData
) {
  await requireAdmin();
  const canManage = await hasPermission("library.manage");
  if (!canManage) return { error: "Forbidden" };

  const raw = {
    name_tg: formData.get("name_tg"),
    name_ru: formData.get("name_ru"),
    slug: formData.get("slug"),
    parent_id: formData.get("parent_id"),
  };

  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) return { error: "Validation failed" };

  const supabase = await createServerClient();

  const { error } = await supabase
    .from("library_categories" as never)
    .update({
      name_tg: parsed.data.name_tg,
      name_ru: parsed.data.name_ru || null,
      slug: parsed.data.slug,
      parent_id: parsed.data.parent_id || null,
    } as never)
    .eq("id" as never, categoryId as never);

  if (error) return { error: error.message };

  return { success: true };
}

export async function deleteCategoryAction(categoryId: string): Promise<void> {
  await requireAdmin();
  const canManage = await hasPermission("library.manage");
  if (!canManage) return;

  const supabase = await createServerClient();

  await supabase
    .from("library_categories" as never)
    .delete()
    .eq("id" as never, categoryId as never);
}
