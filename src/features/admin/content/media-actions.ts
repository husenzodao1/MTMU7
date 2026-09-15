"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, success, type FormState } from "@/lib/actions/result";
import { can, canAny, getAccess } from "@/lib/auth/access";
import { checkFile, isValidStoragePath } from "@/lib/storage/files";
import { createClient } from "@/lib/supabase/server";

/** Registers an uploaded public image in the media library (alt text is required for accessibility). */
export async function registerMediaAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!canAny(access, ["media.upload", "media.manage"])) return done(failure("errors.forbidden"));
  const parsed = z
    .object({
      path: z.string().max(500),
      name: z.string().min(1).max(255),
      size: z.coerce.number().int().positive(),
      type: z.string().max(100),
      altText: z.string().trim().min(3, "validation.altText").max(300, "validation.too_big"),
    })
    .safeParse({ path: formData.get("imagePath"), name: formData.get("imageName"), size: formData.get("imageSize"), type: formData.get("imageType"), altText: formData.get("altText") });
  if (!parsed.success) {
    const alt = parsed.error.issues.find((i) => i.path[0] === "altText");
    return done(failure("errors.validation", alt ? { altText: [alt.message.startsWith("validation.") ? alt.message : "validation.altText"] } : { imagePath: ["errors.file_missing"] }));
  }
  const v = parsed.data;
  const check = checkFile("image", { name: v.name, type: v.type, size: v.size });
  if (!isValidStoragePath(v.path, access.school.id, "media") || !check.ok) return done(failure("errors.invalid_file_path"));
  const supabase = await createClient();
  const { error } = await supabase.from("media_assets").insert({
    school_id: access.school.id,
    bucket: "public-media",
    storage_path: v.path,
    file_name: v.name,
    mime_type: v.type,
    size_bytes: v.size,
    alt_text: v.altText,
    usage: "general",
    uploaded_by: access.userId,
  });
  if (error) return done(mapDbError(error));
  revalidatePath("/admin/media");
  return done(success("admin.media.uploaded"));
}

export async function deleteMediaAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "media.manage")) return done(failure("errors.forbidden"));
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return done(failure("errors.invalid"));
  const supabase = await createClient();
  const { data: asset } = await supabase.from("media_assets").select("id, bucket, storage_path").eq("id", id.data).maybeSingle();
  if (!asset) return done(failure("errors.not_found"));
  const { error: storageError } = await supabase.storage.from(asset.bucket).remove([asset.storage_path]);
  if (storageError) return done(failure("errors.unexpected"));
  const { error } = await supabase.from("media_assets").delete().eq("id", asset.id);
  if (error) return done(mapDbError(error));
  revalidatePath("/admin/media");
  return done(success("common.deleted"));
}
