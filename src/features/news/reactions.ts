"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/lib/validation/uuid";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, keepValues, success, type FormState } from "@/lib/actions/result";
import { getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

/**
 * Likes and unlikes an article. Saying thank you belongs to the moment someone
 * gives their support, so the message appears only on the way in — taking a
 * like back passes quietly.
 */
export async function toggleNewsLikeAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));

  const parsed = uuid.safeParse(formData.get("articleId"));
  if (!parsed.success) return done(failure("errors.invalid"));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("toggle_news_like", { p_article: parsed.data });
  if (error) return done(error.message === "forbidden" ? failure("errors.forbidden") : mapDbError(error));

  const liked = (data as { liked?: boolean } | null)?.liked === true;
  revalidatePath("/news");
  return done(liked ? success("portal.news.likeThanks") : success());
}

const commentSchema = z.object({
  articleId: uuid,
  body: z.string().trim().min(1, "validation.required").max(1000, "validation.too_big"),
});

/** Adds a comment to an article the reader may open. */
export async function addNewsCommentAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));

  const kept = keepValues(formData);
  const parsed = commentSchema.safeParse({
    articleId: formData.get("articleId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return done(failure("errors.validation", { body: [issue?.message ?? "validation.required"] }, kept));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_news_comment", {
    p_article: parsed.data.articleId,
    p_body: parsed.data.body,
  });
  if (error) {
    if (error.message === "forbidden") return done(failure("errors.forbidden"));
    if (error.message === "invalid_body") return done(failure("errors.validation", { body: ["validation.required"] }, kept));
    return done(mapDbError(error));
  }

  revalidatePath("/news");
  return done(success("portal.news.commentAdded"));
}

/** Removes one's own comment, or any comment for someone who moderates the news. */
export async function deleteNewsCommentAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));

  const parsed = uuid.safeParse(formData.get("commentId"));
  if (!parsed.success) return done(failure("errors.invalid"));

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("news_comments")
    .delete({ count: "exact" })
    .eq("id", parsed.data);
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("errors.forbidden"));

  revalidatePath("/news");
  return done(success("common.deleted"));
}
