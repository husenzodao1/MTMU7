"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { uploadPublicImage } from "@/lib/storage/public-images";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const blockSchema = z.object({
  id: z.string().uuid(),
  titleTg: z.string().min(1).max(300),
  titleRu: z.string().max(300).optional(),
  titleEn: z.string().max(300).optional(),
  bodyTg: z.string().optional(),
  bodyRu: z.string().optional(),
  bodyEn: z.string().optional(),
  imageUrl: z.string().max(500).optional(),
});

export async function updateBlockAction(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const user = await requireAdmin();

  const parsed = blockSchema.safeParse({
    id: formData.get("id"),
    titleTg: formData.get("titleTg"),
    titleRu: formData.get("titleRu") || undefined,
    titleEn: formData.get("titleEn") || undefined,
    bodyTg: formData.get("bodyTg") || undefined,
    bodyRu: formData.get("bodyRu") || undefined,
    bodyEn: formData.get("bodyEn") || undefined,
    imageUrl: formData.get("imageUrl") || undefined,
  });

  if (!parsed.success) {
    return { error: "invalidData" };
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("content_blocks" as never)
    .update({
      title_tg: parsed.data.titleTg,
      title_ru: parsed.data.titleRu ?? null,
      title_en: parsed.data.titleEn ?? null,
      body_tg: parsed.data.bodyTg ?? null,
      body_ru: parsed.data.bodyRu ?? null,
      body_en: parsed.data.bodyEn ?? null,
      image_url: parsed.data.imageUrl ?? null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id" as never, parsed.data.id)
    .eq("school_id" as never, user.schoolId);

  if (error) {
    return { error: "saveFailed" };
  }

  revalidatePath("/admin/landing");
  revalidatePath("/");
  return { error: null };
}

export async function uploadLandingImageAction(
  _prevState: { error: string | null; url: string | null },
  formData: FormData
): Promise<{ error: string | null; url: string | null }> {
  const user = await requireAdmin();
  const file = formData.get("file") as File;

  if (!file || file.size === 0) {
    return { error: "noFile", url: null };
  }

  try {
    const url = await uploadPublicImage(user.schoolId, "landing", file);
    revalidatePath("/admin/landing");
    revalidatePath("/");
    return { error: null, url };
  } catch {
    return { error: "uploadFailed", url: null };
  }
}

export async function getLandingBlocksAction() {
  const user = await requireAdmin();

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("content_blocks" as never)
    .select("*" as never)
    .eq("school_id" as never, user.schoolId)
    .in("section" as never, ["hero", "about", "events", "gallery", "support"])
    .order("sort_order" as never, { ascending: true });

  return (data ?? []) as Array<Record<string, unknown>>;
}
