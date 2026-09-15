"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, formDataToObject, parseInput, success, type FormState } from "@/lib/actions/result";
import { canAny, getAccess } from "@/lib/auth/access";
import { checkFile, isValidStoragePath } from "@/lib/storage/files";
import { createClient } from "@/lib/supabase/server";
import { CONTENT_LANGUAGES, LIBRARY_VISIBILITY } from "@/features/content/constants";
import type { Database } from "@/lib/db/database.types";

type BookUpdate = Database["public"]["Tables"]["library_items"]["Update"];

const uuid = z.string().uuid();
const optionalUuid = uuid.optional().or(z.literal("")).transform((v) => v || null);
const optionalInt = (min: number, max: number) =>
  z.string().optional().transform((v) => (v?.trim() ? Number(v) : null)).refine((v) => v === null || (Number.isInteger(v) && v >= min && v <= max), "validation.invalid_value");

const FILE_TYPE_BY_MIME: Record<string, "pdf" | "epub" | "audio"> = {
  "application/pdf": "pdf",
  "application/epub+zip": "epub",
  "audio/mpeg": "audio",
};

const bookSchema = z.object({
  id: optionalUuid,
  intent: z.enum(["draft", "publish", "archive", "restore"]),
  title: z.string().trim().min(1, "validation.required").max(500, "validation.too_big"),
  subtitle: z.string().trim().max(500).optional().transform((v) => v || null),
  author: z.string().trim().max(300).optional().transform((v) => v || null),
  description: z.string().trim().max(5000, "validation.too_big").optional().transform((v) => v || null),
  categoryId: optionalUuid,
  subjectId: optionalUuid,
  gradeLevel: optionalInt(1, 11),
  language: z.enum(CONTENT_LANGUAGES),
  publisher: z.string().trim().max(200).optional().transform((v) => v || null),
  publicationYear: optionalInt(1800, 2100),
  isbn: z.string().trim().max(20).regex(/^([0-9Xx-]{10,17})?$/, "validation.isbn").optional().transform((v) => v || null),
  pageCount: optionalInt(1, 20000),
  tags: z.string().max(500).optional().transform((v) => [...new Set((v ?? "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => x && x.length <= 40))].slice(0, 12)),
  shelfLocation: z.string().trim().max(100).optional().transform((v) => v || null),
  quantity: optionalInt(0, 10000),
  availableQuantity: optionalInt(0, 10000),
  visibility: z.enum(LIBRARY_VISIBILITY),
  isFeatured: z.string().optional().transform((v) => v === "on"),
  coverPath: z.string().max(500).optional(),
  coverName: z.string().max(255).optional(),
  coverSize: z.coerce.number().int().positive().optional(),
  coverType: z.string().max(100).optional(),
  filePath: z.string().max(500).optional(),
  fileName: z.string().max(255).optional(),
  fileSize: z.coerce.number().int().positive().optional(),
  fileType: z.string().max(100).optional(),
  removeFile: z.string().optional(),
});

export async function saveBookAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!canAny(access, ["library.create", "library.update"])) return done(failure("errors.forbidden"));
  const input = parseInput(bookSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const v = input.data;
  const school = access.school.id;

  const quantity = v.quantity ?? 0;
  const available = Math.min(v.availableQuantity ?? quantity, quantity);

  const row: BookUpdate = {
    title: v.title,
    subtitle: v.subtitle,
    author: v.author,
    description: v.description,
    category_id: v.categoryId,
    subject_id: v.subjectId,
    grade_level: v.gradeLevel,
    language: v.language,
    publisher: v.publisher,
    publication_year: v.publicationYear,
    isbn: v.isbn,
    page_count: v.pageCount,
    tags: v.tags,
    shelf_location: v.shelfLocation,
    quantity,
    available_quantity: available,
    visibility: v.visibility,
    is_featured: v.isFeatured,
    status: v.intent === "publish" ? "published" : v.intent === "archive" ? "archived" : "draft",
  };

  if (v.coverPath) {
    const check = checkFile("cover", { name: v.coverName ?? "", type: v.coverType ?? "", size: v.coverSize ?? 0 });
    if (!isValidStoragePath(v.coverPath, school, "covers") || !check.ok) return done(failure("errors.invalid_file_path"));
    row.cover_url = v.coverPath;
  }
  if (v.filePath) {
    const check = checkFile("book", { name: v.fileName ?? "", type: v.fileType ?? "", size: v.fileSize ?? 0 });
    const fileType = FILE_TYPE_BY_MIME[v.fileType ?? ""];
    if (!isValidStoragePath(v.filePath, school, "books") || !check.ok || !fileType) return done(failure("errors.invalid_file_path"));
    Object.assign(row, { file_url: v.filePath, file_name: v.fileName, file_size: v.fileSize, file_type: fileType });
  } else if (v.removeFile === "on") {
    Object.assign(row, { file_url: null, file_name: null, file_size: null, file_type: null });
  }

  const roleIds = formData.getAll("accessRoleId").filter((x): x is string => typeof x === "string" && uuid.safeParse(x).success);
  const classIds = formData.getAll("accessClassId").filter((x): x is string => typeof x === "string" && uuid.safeParse(x).success);
  if (v.visibility === "specific" && roleIds.length === 0 && classIds.length === 0) {
    return done(failure("errors.validation", { accessRoleId: ["validation.chooseOne"] }));
  }

  const supabase = await createClient();
  let id = v.id;
  if (id) {
    const { error, count } = await supabase.from("library_items").update(row, { count: "exact" }).eq("id", id);
    if (error) return done(mapDbError(error));
    if (!count) return done(failure("errors.forbidden"));
  } else {
    const { data, error } = await supabase
      .from("library_items")
      .insert({ ...row, title: v.title, school_id: school })
      .select("id")
      .single();
    if (error || !data) return done(mapDbError(error));
    id = data.id;
  }

  // Replace the explicit access list (only used for visibility = specific).
  const { error: clearError } = await supabase.from("library_item_access").delete().eq("item_id", id);
  if (clearError) return done(mapDbError(clearError));
  if (v.visibility === "specific") {
    const entries = [
      ...roleIds.map((roleId) => ({ item_id: id!, school_id: school, role_id: roleId })),
      ...classIds.map((classId) => ({ item_id: id!, school_id: school, class_id: classId })),
    ];
    const { error } = await supabase.from("library_item_access").insert(entries);
    if (error) return done(mapDbError(error));
  }

  revalidatePath("/admin/library", "layout");
  revalidatePath("/library", "layout");
  redirect(`/admin/library/${id}?saved=${v.intent}`);
}

export async function deleteBookDraftAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return done(failure("errors.invalid"));
  const supabase = await createClient();
  const { error, count } = await supabase.from("library_items").delete({ count: "exact" }).eq("id", id.data);
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("admin.library.cannotDelete"));
  revalidatePath("/admin/library");
  redirect("/admin/library?saved=deleted");
}

export async function saveLibraryCategoryAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!canAny(access, ["library.update"])) return done(failure("errors.forbidden"));
  const input = parseInput(
    z.object({
      id: optionalUuid,
      nameTg: z.string().trim().min(1, "validation.required").max(200),
      nameRu: z.string().trim().max(200).optional().transform((v) => v || null),
      nameEn: z.string().trim().max(200).optional().transform((v) => v || null),
      sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
      isActive: z.string().optional().transform((v) => v === "on"),
    }),
    formDataToObject(formData)
  );
  if (!input.ok) return done(input.result);
  const v = input.data;
  const supabase = await createClient();
  const row = { name_tg: v.nameTg, name_ru: v.nameRu, name_en: v.nameEn, sort_order: v.sortOrder };
  const { error } = v.id
    ? await supabase.from("library_categories").update({ ...row, is_active: v.isActive }).eq("id", v.id)
    : await supabase.from("library_categories").insert({ ...row, school_id: access.school.id, slug: `c-${crypto.randomUUID().slice(0, 8)}` });
  if (error) return done(error.code === "23505" ? failure("errors.duplicate") : mapDbError(error));
  revalidatePath("/admin/library", "layout");
  return done(success(v.id ? "common.saved" : "common.created"));
}
