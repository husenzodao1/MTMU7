import { getLocale, getTranslations } from "next-intl/server";
import { Trash2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Avatar } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/surface";
import { TextAreaField } from "@/components/ui/fields";
import { addNewsCommentAction, deleteNewsCommentAction } from "@/features/news/reactions";
import { formatDateTime } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";

interface CommentRow {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  author_name: string | null;
  author_nickname: string | null;
  author_avatar_url: string | null;
  author_role: { slug: string; name_tg: string; name_ru: string | null; name_en: string | null } | null;
  is_mine: boolean | null;
}

/**
 * The discussion under an article. Each comment carries the standing of whoever
 * wrote it, for the same reason the article does. People may remove their own;
 * anyone who moderates the news may remove any.
 */
export async function NewsComments({ articleId }: { articleId: string }) {
  const t = await getTranslations("portal.news");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_news_comments", { p_article: articleId });
  const comments = (data ?? []) as unknown as CommentRow[];

  return (
    <Card as="section" className="mt-6">
      <CardHeader title={`${t("comments")} · ${comments.length}`} />
      <CardBody className="space-y-5 p-5 sm:p-7">
        {comments.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("noComments")}</p>
        ) : (
          <ul className="space-y-4">
            {comments.map((comment) => (
              <li key={comment.id} className="flex gap-3">
                <Avatar name={comment.author_name ?? ""} src={comment.author_avatar_url} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium text-ink">{comment.author_name}</span>
                    {comment.author_nickname ? (
                      <span className="text-xs text-ink-muted">@{comment.author_nickname}</span>
                    ) : null}
                    {comment.author_role ? (
                      <span className="text-xs text-ink-secondary">{pickName(comment.author_role, locale)}</span>
                    ) : null}
                    <time dateTime={comment.created_at} className="text-xs text-ink-muted tabular">
                      {formatDateTime(comment.created_at, locale)}
                    </time>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-secondary">{comment.body}</p>
                </div>
                {comment.is_mine ? (
                  <ActionForm action={deleteNewsCommentAction} className="shrink-0">
                    <input type="hidden" name="commentId" value={comment.id} />
                    <SubmitButton variant="ghost" size="icon-sm" aria-label={t("commentDelete")}>
                      <Trash2 aria-hidden />
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <ActionForm action={addNewsCommentAction} className="space-y-3 border-t border-line pt-4" resetOnSuccess>
          <input type="hidden" name="articleId" value={articleId} />
          <TextAreaField
            name="body"
            label={t("commentLabel")}
            placeholder={t("commentPlaceholder")}
            rows={3}
            maxLength={1000}
            required
          />
          <SubmitButton size="sm">{t("commentSubmit")}</SubmitButton>
        </ActionForm>
      </CardBody>
    </Card>
  );
}
