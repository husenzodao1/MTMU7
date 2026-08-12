"use server";

import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guard";
import { hasPermission } from "@/lib/permissions/check";
import { z } from "zod";

const bookSchema = z.object({
  title: z.string().min(1).max(500),
  author: z.string().max(300).optional(),
  description: z.string().max(5000).optional(),
  file_path: z.string().min(1),
  file_name: z.string().min(1),
  file_size: z.coerce.number().positive(),
  file_type: z.enum(["pdf", "epub", "audio", "image", "document"]),
  cover_path: z.string().optional(),
  category_id: z.string().uuid().optional().or(z.literal("")),
  subject_id: z.string().uuid().optional().or(z.literal("")),
  language: z.string().default("tg"),
  publication_year: z.coerce.number().int().min(1900).max(2100).optional(),
  publisher: z.string().max(300).optional(),
  grade_level: z.coerce.number().int().min(1).max(11).optional(),
  visibility: z.enum(["all", "teachers", "admin", "specific"]).default("all"),
});

export interface AdminBook {
  id: string;
  title: string;
  author: string | null;
  fileType: string;
  fileSize: number;
  categoryName: string | null;
  visibility: string;
  isPublished: boolean;
  createdAt: string;
}

export async function getAdminBooks(): Promise<AdminBook[]> {
  const user = await requireAdmin();
  const canManage = await hasPermission("library.manage");
  if (!canManage) return [];

  const supabase = await createServerClient();

  const { data } = await supabase
    .from("library_items" as never)
    .select("*, library_categories!left(name_tg)" as never)
    .eq("school_id" as never, user.schoolId)
    .order("created_at" as never, { ascending: false });

  if (!data) return [];

  return (data as Array<Record<string, unknown>>).map((item) => {
    const category = item.library_categories as Record<string, unknown> | null;
    return {
      id: item.id as string,
      title: item.title as string,
      author: item.author as string | null,
      fileType: item.file_type as string,
      fileSize: item.file_size as number,
      categoryName: category?.name_tg as string | null,
      visibility: item.visibility as string,
      isPublished: item.is_published as boolean,
      createdAt: item.created_at as string,
    };
  });
}

export async function createBookAction(_prev: unknown, formData: FormData) {
  const user = await requireAdmin();
  const canManage = await hasPermission("library.manage");
  if (!canManage) return { error: "Forbidden" };

  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    raw[key] = value;
  }

  const parsed = bookSchema.safeParse(raw);
  if (!parsed.success) return { error: "Validation failed" };

  const filePath = parsed.data.file_path;
  if (!filePath.startsWith(`${user.schoolId}/`)) {
    return { error: "Invalid file path" };
  }

  const coverPath = parsed.data.cover_path || null;
  if (coverPath && !coverPath.startsWith(`${user.schoolId}/`)) {
    return { error: "Invalid cover path" };
  }

  const supabase = await createServerClient();

  const { error } = await supabase
    .from("library_items" as never)
    .insert({
      school_id: user.schoolId,
      uploaded_by: user.id,
      title: parsed.data.title,
      author: parsed.data.author || null,
      description: parsed.data.description || null,
      file_url: filePath,
      file_name: parsed.data.file_name,
      file_size: parsed.data.file_size,
      file_type: parsed.data.file_type,
      cover_url: coverPath,
      category_id: parsed.data.category_id || null,
      subject_id: parsed.data.subject_id || null,
      language: parsed.data.language,
      publication_year: parsed.data.publication_year || null,
      publisher: parsed.data.publisher || null,
      grade_level: parsed.data.grade_level || null,
      visibility: parsed.data.visibility,
      is_published: true,
    } as never);

  if (error) return { error: error.message };

  return { success: true };
}

export async function togglePublishAction(
  itemId: string,
  isPublished: boolean
): Promise<void> {
  await requireAdmin();
  const canManage = await hasPermission("library.manage");
  if (!canManage) return;

  const supabase = await createServerClient();

  await supabase
    .from("library_items" as never)
    .update({
      is_published: !isPublished,
      unpublished_at: isPublished ? new Date().toISOString() : null,
    } as never)
    .eq("id" as never, itemId as never);
}

export async function deleteBookAction(itemId: string): Promise<void> {
  await requireAdmin();
  const canManage = await hasPermission("library.manage");
  if (!canManage) return;

  const supabase = await createServerClient();

  await supabase
    .from("library_items" as never)
    .update({
      is_published: false,
      unpublished_at: new Date().toISOString(),
    } as never)
    .eq("id" as never, itemId as never);
}
