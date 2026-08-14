import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "public-images";
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function uploadPublicImage(
  schoolId: string,
  subPath: string,
  file: File
): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Invalid file type");
  }
  if (file.size > MAX_SIZE) {
    throw new Error("File too large");
  }

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${schoolId}/${subPath}/${Date.now()}.${ext}`;

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function deletePublicImage(url: string): Promise<void> {
  const admin = createAdminClient();
  const bucketUrl = admin.storage.from(BUCKET).getPublicUrl("").data.publicUrl;
  const path = url.replace(bucketUrl, "");
  if (!path) return;

  await admin.storage.from(BUCKET).remove([path]);
}
