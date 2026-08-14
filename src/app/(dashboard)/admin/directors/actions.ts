"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { uploadPublicImage } from "@/lib/storage/public-images";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const directorSchema = z.object({
  fullNameTg: z.string().min(1).max(200),
  fullNameRu: z.string().max(200).optional(),
  fullNameEn: z.string().max(200).optional(),
  positionTg: z.string().min(1).max(200),
  positionRu: z.string().max(200).optional(),
  positionEn: z.string().max(200).optional(),
  photoUrl: z.string().max(500).optional(),
  yearStart: z.coerce.number().int().min(1900).max(2100),
  yearEnd: z.coerce.number().int().min(1900).max(2100).optional(),
  sortOrder: z.coerce.number().int().default(0),
});

export async function getDirectorsAction() {
  const user = await requireAdmin();
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("directors" as never)
    .select("*" as never)
    .eq("school_id" as never, user.schoolId)
    .order("sort_order" as never, { ascending: true });

  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function createDirectorAction(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const user = await requireAdmin();

  const parsed = directorSchema.safeParse({
    fullNameTg: formData.get("fullNameTg"),
    fullNameRu: formData.get("fullNameRu") || undefined,
    fullNameEn: formData.get("fullNameEn") || undefined,
    positionTg: formData.get("positionTg"),
    positionRu: formData.get("positionRu") || undefined,
    positionEn: formData.get("positionEn") || undefined,
    photoUrl: formData.get("photoUrl") || undefined,
    yearStart: formData.get("yearStart"),
    yearEnd: formData.get("yearEnd") || undefined,
    sortOrder: formData.get("sortOrder") || 0,
  });

  if (!parsed.success) {
    return { error: "invalidData" };
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("directors" as never)
    .insert({
      school_id: user.schoolId,
      full_name_tg: parsed.data.fullNameTg,
      full_name_ru: parsed.data.fullNameRu ?? null,
      full_name_en: parsed.data.fullNameEn ?? null,
      position_tg: parsed.data.positionTg,
      position_ru: parsed.data.positionRu ?? null,
      position_en: parsed.data.positionEn ?? null,
      photo_url: parsed.data.photoUrl ?? null,
      year_start: parsed.data.yearStart,
      year_end: parsed.data.yearEnd ?? null,
      sort_order: parsed.data.sortOrder,
    } as never);

  if (error) {
    return { error: "saveFailed" };
  }

  revalidatePath("/admin/directors");
  revalidatePath("/");
  return { error: null };
}

export async function deleteDirectorAction(id: string) {
  await requireAdmin();

  const supabase = await createServerClient();
  await supabase
    .from("directors" as never)
    .delete()
    .eq("id" as never, id);

  revalidatePath("/admin/directors");
  revalidatePath("/");
}

export async function toggleDirectorVisibilityAction(id: string, isVisible: boolean) {
  await requireAdmin();

  const supabase = await createServerClient();
  await supabase
    .from("directors" as never)
    .update({ is_visible: isVisible } as never)
    .eq("id" as never, id);

  revalidatePath("/admin/directors");
  revalidatePath("/");
}

export async function uploadDirectorPhotoAction(
  _prevState: { error: string | null; url: string | null },
  formData: FormData
): Promise<{ error: string | null; url: string | null }> {
  const user = await requireAdmin();
  const file = formData.get("file") as File;

  if (!file || file.size === 0) {
    return { error: "noFile", url: null };
  }

  try {
    const url = await uploadPublicImage(user.schoolId, "directors", file);
    revalidatePath("/admin/directors");
    revalidatePath("/");
    return { error: null, url };
  } catch {
    return { error: "uploadFailed", url: null };
  }
}
