"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, formDataToObject, parseInput, success, type FormState } from "@/lib/actions/result";
import { can, canAny, getAccess } from "@/lib/auth/access";
import { checkFile, isValidStoragePath } from "@/lib/storage/files";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_ACCESS, DOCUMENT_CATEGORIES, ROLE_SLUGS } from "@/features/content/constants";

const uuid = z.string().uuid();

const documentSchema = z.object({
  id: uuid.optional().or(z.literal("")).transform((v) => v || undefined),
  title: z.string().trim().min(2, "validation.too_small").max(300, "validation.too_big"),
  description: z.string().trim().max(5000).optional().transform((v) => v || null),
  category: z.enum(DOCUMENT_CATEGORIES),
  folderId: uuid.optional().or(z.literal("")).transform((v) => v || null),
  access: z.enum(DOCUMENT_ACCESS),
  status: z.enum(["draft", "published"]),
  filePath: z.string().max(500).optional(),
  fileName: z.string().max(255).optional(),
  fileSize: z.coerce.number().int().positive().optional(),
  fileType: z.string().max(100).optional(),
});

export async function saveDocumentAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!canAny(access, ["documents.create", "documents.publish"])) return done(failure("errors.forbidden"));
  const input = parseInput(documentSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const v = input.data;
  const school = access.school.id;
  const roles = formData.getAll("allowedRoles").filter((r): r is string => typeof r === "string" && (ROLE_SLUGS as readonly string[]).includes(r));
  if (v.access === "roles" && roles.length === 0) return done(failure("errors.validation", { allowedRoles: ["validation.chooseOne"] }));
  if (v.status === "published" && !can(access, "documents.publish")) return done(failure("errors.publish_permission"));

  let file: { storage_path: string; file_name: string; mime_type: string; size_bytes: number } | undefined;
  if (v.filePath) {
    const check = checkFile("document", { name: v.fileName ?? "", type: v.fileType ?? "", size: v.fileSize ?? 0 });
    if (!isValidStoragePath(v.filePath, school, "docs") || !check.ok) return done(failure("errors.invalid_file_path"));
    file = { storage_path: v.filePath, file_name: v.fileName!, mime_type: v.fileType!, size_bytes: v.fileSize! };
  }
  if (!v.id && !file) return done(failure("errors.validation", { filePath: ["errors.file_missing"] }));

  const row = {
    title: v.title,
    description: v.description,
    category: v.category,
    folder_id: v.folderId,
    access: v.access,
    allowed_roles: v.access === "roles" ? roles : [],
    status: v.status,
    ...(file ?? {}),
  };
  const supabase = await createClient();
  const { error } = v.id
    ? await supabase.from("documents").update(row).eq("id", v.id)
    : await supabase.from("documents").insert({ ...row, ...file!, school_id: school });
  if (error) return done(mapDbError(error));
  revalidatePath("/admin/documents");
  revalidatePath("/documents");
  return done(success(v.id ? (file ? "admin.documents.versionAdded" : "common.saved") : "admin.documents.uploaded"));
}

export async function setDocumentStatusAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const parsed = z.object({ id: uuid, status: z.enum(["draft", "published", "archived"]) }).safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) return done(failure("errors.invalid"));
  const supabase = await createClient();
  const { error, count } = await supabase.from("documents").update({ status: parsed.data.status }, { count: "exact" }).eq("id", parsed.data.id);
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("errors.forbidden"));
  revalidatePath("/admin/documents");
  revalidatePath("/documents");
  return done(success("common.saved"));
}

export async function saveFolderAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "documents.create")) return done(failure("errors.forbidden"));
  const parsed = z
    .object({ id: uuid.optional().or(z.literal("")).transform((v) => v || undefined), name: z.string().trim().min(1, "validation.required").max(200, "validation.too_big"), parentId: uuid.optional().or(z.literal("")).transform((v) => v || null) })
    .safeParse({ id: formData.get("id") ?? "", name: formData.get("name"), parentId: formData.get("parentId") ?? "" });
  if (!parsed.success) return done(failure("errors.validation", { name: ["validation.required"] }));
  const supabase = await createClient();
  const { error } = parsed.data.id
    ? await supabase.from("document_folders").update({ name: parsed.data.name }).eq("id", parsed.data.id)
    : await supabase.from("document_folders").insert({ name: parsed.data.name, parent_id: parsed.data.parentId, school_id: access.school.id });
  if (error) return done(error.code === "23505" ? failure("errors.validation", { name: ["validation.duplicateName"] }) : mapDbError(error));
  revalidatePath("/admin/documents");
  return done(success(parsed.data.id ? "common.saved" : "common.created"));
}
