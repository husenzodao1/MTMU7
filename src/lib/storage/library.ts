"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { canPerformAction } from "@/lib/modules/check";
import { hasPermission } from "@/lib/permissions/check";
import { redirect } from "next/navigation";

const LIBRARY_FILES_BUCKET = "library-files";
const LIBRARY_COVERS_BUCKET = "library-covers";
const SIGNED_URL_EXPIRY = 3600;

function buildStoragePath(
  schoolId: string,
  itemId: string,
  fileName: string
): string {
  return `${schoolId}/${itemId}/${fileName}`;
}

export async function getSignedFileUrl(
  itemId: string
): Promise<string | null> {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canRead = await canPerformAction("library", "library.read");
  if (!canRead) return null;

  const supabase = await createServerClient();

  const { data: item } = await supabase
    .from("library_items" as never)
    .select("file_url, file_name, school_id, is_published" as never)
    .eq("id" as never, itemId as never)
    .single();

  if (!item) return null;

  const row = item as Record<string, unknown>;

  if (row.school_id !== user.schoolId) return null;
  if (!(row.is_published as boolean)) return null;

  const storagePath = row.file_url as string;

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.storage
    .from(LIBRARY_FILES_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY);

  if (error || !data) return null;

  return data.signedUrl;
}

export async function getSignedCoverUrl(
  itemId: string
): Promise<string | null> {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const supabase = await createServerClient();

  const { data: item } = await supabase
    .from("library_items" as never)
    .select("cover_url, school_id" as never)
    .eq("id" as never, itemId as never)
    .single();

  if (!item) return null;

  const row = item as Record<string, unknown>;
  const coverPath = row.cover_url as string | null;

  if (!coverPath) return null;
  if (row.school_id !== user.schoolId) return null;

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.storage
    .from(LIBRARY_COVERS_BUCKET)
    .createSignedUrl(coverPath, SIGNED_URL_EXPIRY);

  if (error || !data) return null;

  return data.signedUrl;
}

export async function uploadLibraryFile(
  itemId: string,
  fileName: string,
  file: File
): Promise<{ path: string; size: number } | { error: string }> {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canManage = await hasPermission("library.manage");
  if (!canManage) return { error: "Forbidden" };

  const storagePath = buildStoragePath(user.schoolId, itemId, fileName);

  const adminClient = createAdminClient();
  const { error } = await adminClient.storage
    .from(LIBRARY_FILES_BUCKET)
    .upload(storagePath, file, {
      upsert: true,
    });

  if (error) return { error: error.message };

  return { path: storagePath, size: file.size };
}

export async function uploadLibraryCover(
  itemId: string,
  fileName: string,
  file: File
): Promise<{ path: string } | { error: string }> {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canManage = await hasPermission("library.manage");
  if (!canManage) return { error: "Forbidden" };

  const storagePath = buildStoragePath(user.schoolId, itemId, fileName);

  const adminClient = createAdminClient();
  const { error } = await adminClient.storage
    .from(LIBRARY_COVERS_BUCKET)
    .upload(storagePath, file, {
      upsert: true,
    });

  if (error) return { error: error.message };

  return { path: storagePath };
}

export async function deleteLibraryFile(
  storagePath: string
): Promise<void> {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canManage = await hasPermission("library.manage");
  if (!canManage) return;

  if (!storagePath.startsWith(`${user.schoolId}/`)) return;

  const adminClient = createAdminClient();
  await adminClient.storage
    .from(LIBRARY_FILES_BUCKET)
    .remove([storagePath]);
}

export async function deleteLibraryCover(
  storagePath: string
): Promise<void> {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canManage = await hasPermission("library.manage");
  if (!canManage) return;

  if (!storagePath.startsWith(`${user.schoolId}/`)) return;

  const adminClient = createAdminClient();
  await adminClient.storage
    .from(LIBRARY_COVERS_BUCKET)
    .remove([storagePath]);
}
