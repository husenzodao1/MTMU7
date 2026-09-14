"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { DirectUpload } from "@/components/ui/direct-upload";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { Checkbox, Fieldset } from "@/components/ui/form-controls";
import { Markdown } from "@/components/ui/misc";
import { saveArticleAction } from "@/features/news/actions";
import { cn } from "@/lib/utils/cn";

export interface EditorArticle {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  language: string;
  visibility: string;
  categoryId: string | null;
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  publishAt: string;
  expiresAt: string;
  isFeatured: boolean;
  status: string;
  coverImageUrl: string | null;
  rejectionReason: string | null;
}

export function NewsEditor({
  article,
  schoolId,
  categories,
  canPublish,
  canArchive,
  isEditor,
  returnTo,
}: {
  article: EditorArticle | null;
  schoolId: string;
  categories: Array<{ value: string; label: string }>;
  canPublish: boolean;
  canArchive: boolean;
  isEditor: boolean;
  returnTo: "portal" | "admin";
}) {
  const t = useTranslations("portal.newsEditor");
  const tl = useTranslations("common.locales");
  const [content, setContent] = useState(article?.content ?? "");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const status = article?.status ?? "draft";
  const published = status === "published";

  return (
    <ActionForm action={saveArticleAction} className="grid gap-5 lg:grid-cols-3">
      <input type="hidden" name="id" value={article?.id ?? ""} />
      <input type="hidden" name="returnTo" value={returnTo} />

      <div className="space-y-5 lg:col-span-2">
        <Fieldset legend={t("sections.content")}>
          <TextField name="title" label={t("title")} defaultValue={article?.title} required maxLength={500} />
          <TextAreaField name="summary" label={t("summary")} hint={t("summaryHint")} defaultValue={article?.summary ?? ""} rows={2} maxLength={500} />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink" id="content-label">
                {t("body")}
              </span>
              <div role="tablist" aria-labelledby="content-label" className="flex rounded-md border border-line p-0.5">
                {(["write", "preview"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                    className={cn("rounded px-2.5 py-1 text-sm", tab === key ? "bg-brand-50 font-medium text-brand-800" : "text-ink-secondary hover:text-ink")}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              name="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={16}
              maxLength={100000}
              aria-labelledby="content-label"
              aria-describedby="content-hint"
              className={cn(
                "block w-full rounded-md border border-line-strong bg-surface px-3 py-2 font-mono text-sm leading-relaxed focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20",
                tab === "preview" && "hidden"
              )}
            />
            {tab === "preview" ? (
              <div className="min-h-64 rounded-md border border-line bg-surface p-4">{content.trim() ? <Markdown source={content} /> : <p className="text-sm text-ink-muted">{t("previewEmpty")}</p>}</div>
            ) : null}
            <p id="content-hint" className="text-sm text-ink-muted">
              {t("formatting")}
            </p>
          </div>
        </Fieldset>

        <Fieldset legend={t("sections.media")}>
          {article?.coverImageUrl ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- preview of the stored cover */}
              <img src={article.coverImageUrl} alt="" className="h-20 w-32 rounded-md border border-line object-cover" />
              <Checkbox name="keepCover" defaultChecked label={t("keepCover")} />
            </div>
          ) : null}
          <DirectUpload kind="image" folder={`${schoolId}/news`} name="cover" label={t("cover")} hint={t("coverHint")} />
        </Fieldset>

        <Fieldset legend={t("sections.seo")}>
          <TextField name="slug" label={t("slug")} hint={t("slugHint")} defaultValue={article?.slug} maxLength={140} />
          <TextField name="seoTitle" label={t("seoTitle")} defaultValue={article?.seoTitle ?? ""} maxLength={200} />
          <TextAreaField name="seoDescription" label={t("seoDescription")} defaultValue={article?.seoDescription ?? ""} rows={2} maxLength={300} />
        </Fieldset>
      </div>

      <div className="space-y-5">
        <Fieldset legend={t("sections.publishing")}>
          {article?.rejectionReason && status === "draft" ? (
            <p className="rounded-md bg-warning-50 px-3 py-2 text-sm text-warning-700">{t("returned", { reason: article.rejectionReason })}</p>
          ) : null}
          <SelectField
            name="visibility"
            label={t("visibility")}
            defaultValue={article?.visibility ?? "school"}
            options={["public", "school", "staff"].map((value) => ({ value, label: t(`visibilityOptions.${value}`) }))}
          />
          <SelectField
            name="language"
            label={t("language")}
            defaultValue={article?.language ?? "tg"}
            options={["tg", "ru", "en"].map((value) => ({ value, label: tl(value) }))}
          />
          <SelectField name="categoryId" label={t("category")} defaultValue={article?.categoryId ?? ""} placeholder={t("noCategory")} options={categories} />
          <TextField name="tags" label={t("tags")} hint={t("tagsHint")} defaultValue={article?.tags.join(", ")} maxLength={500} />
          <TextField name="publishAt" type="datetime-local" label={t("publishAt")} hint={t("publishAtHint")} defaultValue={article?.publishAt} />
          <TextField name="expiresAt" type="datetime-local" label={t("expiresAt")} defaultValue={article?.expiresAt} />
          {isEditor ? <Checkbox name="isFeatured" defaultChecked={article?.isFeatured} label={t("featured")} /> : null}
        </Fieldset>

        <div className="space-y-2 rounded-lg border border-line bg-surface p-4">
          <p className="text-sm text-ink-secondary">{t("currentStatus", { status: t(`status.${status}`) })}</p>
          <SubmitButton name="intent" value="draft" variant="secondary" className="w-full">
            {published ? t("actions.unpublishSave") : t("actions.saveDraft")}
          </SubmitButton>
          {!canPublish && status !== "review" ? (
            <SubmitButton name="intent" value="review" className="w-full">
              {t("actions.submitReview")}
            </SubmitButton>
          ) : null}
          {canPublish ? (
            <SubmitButton name="intent" value="publish" className="w-full">
              {published ? t("actions.update") : t("actions.publish")}
            </SubmitButton>
          ) : null}
          {canArchive && article && status !== "archived" ? (
            <SubmitButton name="intent" value="archive" variant="danger-outline" className="w-full">
              {t("actions.archive")}
            </SubmitButton>
          ) : null}
          {canArchive && status === "archived" ? (
            <SubmitButton name="intent" value="restore" variant="secondary" className="w-full">
              {t("actions.restore")}
            </SubmitButton>
          ) : null}
          <p className="text-xs text-ink-muted">{canPublish ? t("publishHint") : t("reviewHint")}</p>
        </div>
      </div>
    </ActionForm>
  );
}
