"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { uuid } from "@/lib/validation/uuid";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, formDataToObject, parseInput, success, type FormState } from "@/lib/actions/result";
import { can, canAny, getAccess } from "@/lib/auth/access";
import { localInputToIso } from "@/lib/i18n/zoned";
import { isValidStoragePath } from "@/lib/storage/files";
import { createClient } from "@/lib/supabase/server";
import { CONTENT_LANGUAGES, NEWS_VISIBILITY } from "@/features/content/constants";
import { publicMediaUrl } from "@/features/content/queries";

const INTENTS = ["draft", "review", "approve", "publish", "unpublish", "archive", "restore"] as const;

const articleSchema = z.object({
  id: uuid.optional().or(z.literal("")).transform((v) => v || undefined),
  intent: z.enum(INTENTS),
  title: z.string().trim().min(3, "validation.too_small").max(500, "validation.too_big"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(140)
    .regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/, "validation.slug")
    .optional()
    .transform((v) => v || undefined),
  summary: z.string().trim().max(500, "validation.too_big").optional().transform((v) => v || null),
  content: z.string().max(100000, "validation.too_big").default(""),
  language: z.enum(CONTENT_LANGUAGES),
  visibility: z.enum(NEWS_VISIBILITY),
  categoryId: uuid.optional().or(z.literal("")).transform((v) => v || null),
  tags: z
    .string()
    .max(500)
    .optional()
    .transform((v) =>
      [...new Set((v ?? "").split(",").map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0 && tag.length <= 40))].slice(0, 12)
    ),
  seoTitle: z.string().trim().max(200).optional().transform((v) => v || null),
  seoDescription: z.string().trim().max(300).optional().transform((v) => v || null),
  publishAt: z.string().optional(),
  expiresAt: z.string().optional(),
  isFeatured: z.string().optional().transform((v) => v === "on" || v === "true"),
  coverPath: z.string().max(500).optional(),
  keepCover: z.string().optional(),
  returnTo: z.enum(["portal", "admin"]).default("portal"),
});

/** Create or update an article; `intent` selects the workflow transition. */
export async function saveArticleAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const input = parseInput(articleSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const v = input.data;

  const isEditor = canAny(access, ["news.update", "news.publish", "news.archive"]);
  if (!can(access, "news.create") && !isEditor) return done(failure("errors.forbidden"));

  const timeZone = access.school.timezone;
  const publishAt = localInputToIso(v.publishAt, timeZone);
  const expiresAt = localInputToIso(v.expiresAt, timeZone);
  if (publishAt && expiresAt && expiresAt <= publishAt) {
    return done(failure("errors.validation", { expiresAt: ["validation.dateOrder"] }));
  }
  if (v.intent === "review" && v.content.trim().length < 20) {
    return done(failure("errors.validation", { content: ["validation.too_small"] }));
  }

  let coverImageUrl: string | null | undefined;
  if (v.coverPath) {
    if (!isValidStoragePath(v.coverPath, access.school.id, "news")) return done(failure("errors.invalid_file_path"));
    coverImageUrl = publicMediaUrl(v.coverPath);
  } else if (!v.keepCover) {
    coverImageUrl = null;
  }

  const status = (() => {
    switch (v.intent) {
      case "draft":
      case "unpublish":
      case "restore":
        return "draft";
      case "review":
        return "review";
      case "approve":
        return "approved";
      case "publish":
        return "published";
      case "archive":
        return "archived";
    }
  })();

  const payload = {
    title: v.title,
    ...(v.slug ? { slug: v.slug } : {}),
    summary: v.summary,
    content: v.content,
    language: v.language,
    visibility: v.visibility,
    category_id: v.categoryId,
    tags: v.tags,
    seo_title: v.seoTitle,
    seo_description: v.seoDescription,
    publish_at: publishAt,
    expires_at: expiresAt,
    status,
    // A resubmitted or published article no longer carries the editor's return note.
    ...(v.intent === "review" || v.intent === "publish" || v.intent === "approve" ? { rejection_reason: null } : {}),
    ...(isEditor ? { is_featured: v.isFeatured } : {}),
    ...(coverImageUrl !== undefined ? { cover_image_url: coverImageUrl } : {}),
  };

  const supabase = await createClient();
  let articleId = v.id;
  if (articleId) {
    const { error } = await supabase.from("news_articles").update(payload).eq("id", articleId).eq("school_id", access.school.id);
    if (error) return done(mapDbError(error));
  } else {
    const { data, error } = await supabase
      .from("news_articles")
      // An empty slug is derived from the title by the database trigger.
      .insert({ ...payload, slug: v.slug ?? "", school_id: access.school.id })
      .select("id")
      .single();
    if (error || !data) return done(mapDbError(error));
    articleId = data.id;
  }

  revalidatePath("/news");
  revalidatePath("/admin/news");
  revalidatePath("/", "layout");
  const base = v.returnTo === "admin" ? "/admin/news" : "/news/mine";
  redirect(`${base}?saved=${v.intent}&id=${articleId}`);
}

export async function deleteDraftArticleAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return done(failure("errors.invalid"));
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("news_articles")
    .delete({ count: "exact" })
    .eq("id", id.data)
    .eq("status", "draft");
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("errors.forbidden"));
  revalidatePath("/news/mine");
  revalidatePath("/admin/news");
  const returnTo = formData.get("returnTo") === "admin" ? "/admin/news" : "/news/mine";
  redirect(`${returnTo}?saved=deleted`);
}

/** Editor returns an article in review to its author with a note. */
export async function returnArticleAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "news.publish")) return done(failure("errors.forbidden"));
  const parsed = z
    .object({ id: uuid, reason: z.string().trim().min(3, "validation.too_small").max(500, "validation.too_big") })
    .safeParse({ id: formData.get("id"), reason: formData.get("reason") });
  if (!parsed.success) return done(failure("errors.validation", { reason: ["validation.required"] }));
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("news_articles")
    .update({ status: "draft", rejection_reason: parsed.data.reason }, { count: "exact" })
    .eq("id", parsed.data.id)
    .eq("status", "review");
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("errors.conflict"));
  revalidatePath("/admin/news");
  redirect("/admin/news?saved=returned");
}

const categorySchema = z.object({
  id: uuid.optional().or(z.literal("")).transform((v) => v || undefined),
  nameTg: z.string().trim().min(1, "validation.required").max(100, "validation.too_big"),
  nameRu: z.string().trim().max(100).optional().transform((v) => v || null),
  nameEn: z.string().trim().max(100).optional().transform((v) => v || null),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  isActive: z.string().optional().transform((v) => v === "on"),
});

export async function saveNewsCategoryAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!canAny(access, ["news.publish", "news.update"])) return done(failure("errors.forbidden"));
  const input = parseInput(categorySchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const v = input.data;
  const supabase = await createClient();
  const row = { name_tg: v.nameTg, name_ru: v.nameRu, name_en: v.nameEn, sort_order: v.sortOrder };
  const { error } = v.id
    ? await supabase.from("news_categories").update({ ...row, is_active: v.isActive }).eq("id", v.id)
    : await supabase.from("news_categories").insert({
        ...row,
        school_id: access.school.id,
        slug: `${(v.nameEn ?? v.nameRu ?? v.nameTg).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "category"}-${Math.random().toString(36).slice(2, 6)}`,
      });
  if (error) return done(error.code === "23505" ? failure("errors.duplicate") : mapDbError(error));
  revalidatePath("/admin/news");
  revalidatePath("/news");
  return done(success(v.id ? "common.saved" : "common.created"));
}
