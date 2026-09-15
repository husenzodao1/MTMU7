"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, success, type FormState } from "@/lib/actions/result";
import { can, getAccess } from "@/lib/auth/access";
import { safeHref } from "@/lib/content/markdown";
import { checkFile, isValidStoragePath } from "@/lib/storage/files";
import { createClient } from "@/lib/supabase/server";
import { isSectionKey, parseLines, SECTION_DEFINITIONS } from "@/features/site/sections";
import type { Json } from "@/lib/db/database.types";

const LOCALES = ["tg", "ru", "en"] as const;

/**
 * Saves one homepage section. Editing official content withdraws a previous
 * approval unless the editor explicitly approves the new wording.
 */
export async function saveSiteSectionAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "cms.manage")) return done(failure("errors.forbidden"));
  const key = String(formData.get("sectionKey") ?? "");
  if (!isSectionKey(key)) return done(failure("errors.invalid"));
  const definition = SECTION_DEFINITIONS[key];
  const school = access.school.id;
  const fieldErrors: Record<string, string[]> = {};

  const content: Record<string, Record<string, string>> = { tg: {}, ru: {}, en: {}, shared: {} };
  for (const locale of LOCALES) {
    for (const field of definition.localized) {
      const name = `${locale}_${field.name}`;
      const value = String(formData.get(name) ?? "").trim();
      if (value.length > field.maxLength) fieldErrors[name] = ["validation.too_big"];
      if (field.name === "items" && key === "links" && value) {
        const invalid = parseLines(value).some((item) => !safeHref(item.value));
        if (invalid) fieldErrors[name] = ["validation.url"];
      }
      if (value) content[locale]![field.name] = value;
    }
  }

  const existing = await (await createClient()).from("site_sections").select("content").eq("school_id", school).eq("section_key", key).maybeSingle();
  const previousShared = ((existing.data?.content as Record<string, Record<string, string>> | null)?.shared ?? {}) as Record<string, string>;

  for (const field of definition.shared) {
    const name = `shared_${field.name}`;
    if (field.kind === "image") {
      const path = String(formData.get(`${name}Path`) ?? "");
      if (path) {
        const check = checkFile("image", { name: String(formData.get(`${name}Name`) ?? ""), type: String(formData.get(`${name}Type`) ?? ""), size: Number(formData.get(`${name}Size`) ?? 0) });
        if (!isValidStoragePath(path, school, "site") || !check.ok) return done(failure("errors.invalid_file_path"));
        content.shared![field.name] = path;
      } else if (formData.get(`${name}Remove`) !== "on" && previousShared[field.name]) {
        content.shared![field.name] = previousShared[field.name]!;
      }
      continue;
    }
    const value = String(formData.get(name) ?? "").trim();
    if (!value) continue;
    const valid =
      field.kind === "number" ? /^\d{1,2}$/.test(value) && Number(value) >= 1 && Number(value) <= 24
      : field.kind === "email" ? z.string().email().safeParse(value).success
      : field.kind === "phone" ? /^[+0-9 ()-]{5,30}$/.test(value)
      : /^https:\/\/[^\s]{3,500}$/.test(value);
    if (!valid) fieldErrors[name] = [field.kind === "email" ? "validation.email" : field.kind === "phone" ? "validation.phone" : field.kind === "url" ? "validation.url" : "validation.invalid_value"];
    else content.shared![field.name] = value;
  }
  if (Object.keys(fieldErrors).length > 0) return done(failure("errors.validation", fieldErrors));

  const sortOrder = Number(formData.get("sortOrder") ?? 0);
  const approve = definition.requiresApproval ? formData.get("approve") === "on" : true;
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("site_sections")
    .update(
      {
        content: content as unknown as Json,
        is_enabled: formData.get("isEnabled") === "on",
        sort_order: Number.isInteger(sortOrder) && sortOrder >= 0 && sortOrder <= 100 ? sortOrder : 0,
        is_approved: approve,
      },
      { count: "exact" }
    )
    .eq("school_id", school)
    .eq("section_key", key);
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("errors.forbidden"));
  revalidatePath("/", "layout");
  return done(success(definition.requiresApproval && !approve ? "admin.website.savedPendingApproval" : "admin.website.saved"));
}

const pageSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || undefined),
  slug: z.string().trim().toLowerCase().min(2, "validation.too_small").max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "validation.slug"),
  titleTg: z.string().trim().min(1, "validation.required").max(200),
  titleRu: z.string().trim().max(200).optional().transform((v) => v || null),
  titleEn: z.string().trim().max(200).optional().transform((v) => v || null),
  bodyTg: z.string().max(50000).optional().transform((v) => v?.trim() || null),
  bodyRu: z.string().max(50000).optional().transform((v) => v?.trim() || null),
  bodyEn: z.string().max(50000).optional().transform((v) => v?.trim() || null),
  isPublished: z.string().optional().transform((v) => v === "on"),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});

export async function savePageAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "cms.manage")) return done(failure("errors.forbidden"));
  const parsed = pageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return done(failure("errors.validation", Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), [i.message.startsWith("validation.") ? i.message : "validation.invalid_value"]]))));
  }
  const v = parsed.data;
  const school = access.school.id;
  const supabase = await createClient();
  const pageRow = { slug: v.slug, title_tg: v.titleTg, title_ru: v.titleRu, title_en: v.titleEn, is_published: v.isPublished, sort_order: v.sortOrder };

  let pageId = v.id;
  if (pageId) {
    const { error } = await supabase.from("pages").update(pageRow).eq("id", pageId);
    if (error) return done(error.code === "23505" ? failure("errors.validation", { slug: ["validation.duplicateName"] }) : mapDbError(error));
  } else {
    const { data, error } = await supabase.from("pages").insert({ ...pageRow, school_id: school }).select("id").single();
    if (error || !data) return done(error?.code === "23505" ? failure("errors.validation", { slug: ["validation.duplicateName"] }) : mapDbError(error));
    pageId = data.id;
  }

  // One text block per page carries the body in each language (no HTML is stored).
  const blockRow = {
    title_tg: v.titleTg,
    title_ru: v.titleRu,
    title_en: v.titleEn,
    body_tg: v.bodyTg,
    body_ru: v.bodyRu,
    body_en: v.bodyEn,
    is_visible: true,
    type: "text",
    section: "page",
  };
  const { data: block } = await supabase.from("content_blocks").select("id").eq("page_id", pageId).eq("section", "page").maybeSingle();
  const { error: blockError } = block
    ? await supabase.from("content_blocks").update(blockRow).eq("id", block.id)
    : await supabase.from("content_blocks").insert({ ...blockRow, page_id: pageId, school_id: school, sort_order: 0 });
  if (blockError) return done(mapDbError(blockError));

  revalidatePath("/admin/website");
  revalidatePath("/", "layout");
  return done(success(v.id ? "common.saved" : "common.created"));
}
