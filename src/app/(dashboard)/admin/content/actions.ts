"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const createPageSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  titleTg: z.string().min(1).max(300),
  titleRu: z.string().max(300).optional(),
});

export async function createPageAction(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const user = await requireAdmin();

  const parsed = createPageSchema.safeParse({
    slug: formData.get("slug"),
    titleTg: formData.get("titleTg"),
    titleRu: formData.get("titleRu") || undefined,
  });

  if (!parsed.success) {
    return { error: "invalidData" };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("pages" as never)
    .insert({
      school_id: user.schoolId,
      slug: parsed.data.slug,
      title_tg: parsed.data.titleTg,
      title_ru: parsed.data.titleRu ?? null,
    } as never)
    .select("id" as never)
    .single();

  if (error) {
    if (error.code === "23505") return { error: "duplicateSlug" };
    return { error: "saveFailed" };
  }

  const row = data as Record<string, unknown>;
  revalidatePath("/admin/content");
  redirect(`/admin/content/${row.id}`);
}

export async function togglePagePublishAction(pageId: string, publish: boolean) {
  await requireAdmin();

  const supabase = await createServerClient();
  await supabase
    .from("pages" as never)
    .update({ is_published: publish } as never)
    .eq("id" as never, pageId);

  revalidatePath("/admin/content");
}

export async function deletePageAction(pageId: string) {
  await requireAdmin();

  const supabase = await createServerClient();
  await supabase
    .from("pages" as never)
    .delete()
    .eq("id" as never, pageId);

  revalidatePath("/admin/content");
}
