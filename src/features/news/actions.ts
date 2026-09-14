"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, formDataToObject, parseInput, type FormState } from "@/lib/actions/result";
import { can, canAny, getAccess } from "@/lib/auth/access";
import { localInputToIso } from "@/lib/i18n/zoned";
import { isValidStoragePath } from "@/lib/storage/files";
import { createClient } from "@/lib/supabase/server";
import { CONTENT_LANGUAGES, NEWS_VISIBILITY } from "@/features/content/constants";
import { publicMediaUrl } from "@/features/content/queries";

const INTENTS = ["draft", "review", "approve", "publish", "unpublish", "archive", "restore"] as const;

const articleSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || undefined),
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
  categoryId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
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
  const id = z.string().uuid().safeParse(formData.get("id"));
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
