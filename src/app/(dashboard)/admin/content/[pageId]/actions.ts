"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const blockSchema = z.object({
  section: z.string().min(1).max(50),
  type: z.enum(["text", "image", "html", "banner", "gallery"]),
  titleTg: z.string().optional(),
  bodyTg: z.string().optional(),
  imageUrl: z.string().optional(),
});

export async function addBlockAction(
  pageId: string,
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const user = await requireAdmin();

  const parsed = blockSchema.safeParse({
    section: formData.get("section"),
    type: formData.get("type"),
    titleTg: formData.get("titleTg") || undefined,
    bodyTg: formData.get("bodyTg") || undefined,
    imageUrl: formData.get("imageUrl") || undefined,
  });

  if (!parsed.success) return { error: "invalidData" };

  const supabase = await createServerClient();

  const { count } = await supabase
    .from("content_blocks" as never)
    .select("id" as never, { count: "exact", head: true })
    .eq("page_id" as never, pageId);

  const { error } = await supabase
    .from("content_blocks" as never)
    .insert({
      school_id: user.schoolId,
      page_id: pageId,
      section: parsed.data.section,
      type: parsed.data.type,
      title_tg: parsed.data.titleTg ?? null,
      body_tg: parsed.data.bodyTg ?? null,
      image_url: parsed.data.imageUrl ?? null,
      sort_order: (count ?? 0) + 1,
    } as never);

  if (error) return { error: "saveFailed" };

  revalidatePath(`/admin/content/${pageId}`);
  return { error: null };
}

export async function deleteBlockAction(pageId: string, blockId: string) {
  await requireAdmin();

  const supabase = await createServerClient();
  await supabase
    .from("content_blocks" as never)
    .delete()
    .eq("id" as never, blockId);

  revalidatePath(`/admin/content/${pageId}`);
}

export async function toggleBlockVisibilityAction(
  pageId: string,
  blockId: string,
  visible: boolean
) {
  await requireAdmin();

  const supabase = await createServerClient();
  await supabase
    .from("content_blocks" as never)
    .update({ is_visible: visible } as never)
    .eq("id" as never, blockId);

  revalidatePath(`/admin/content/${pageId}`);
}
