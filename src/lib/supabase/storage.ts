"use server";

import { createServerClient } from "@/lib/supabase/server";

const AVATAR_BUCKET = "avatars";
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function uploadAvatarAction(
  formData: FormData
): Promise<{ url: string | null; error: string | null }> {
  const file = formData.get("avatar") as File | null;
  if (!file || file.size === 0) {
    return { url: null, error: null };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { url: null, error: "fileTooLarge" };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { url: null, error: "invalidFileType" };
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { url: null, error: "unauthorized" };
  }

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    return { url: null, error: "uploadFailed" };
  }

  const { data: urlData } = supabase.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(path);

  return { url: urlData.publicUrl, error: null };
}
