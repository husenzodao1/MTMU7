import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { deleteDraftArticleAction, returnArticleAction } from "@/features/news/actions";
import { NewsEditor } from "@/features/news/editor";
import { getArticleForEdit, getNewsCategories } from "@/features/news/queries";
import { ConfirmAction, FormDialog } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/fields";
import { Alert, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import type { Locale } from "@/lib/i18n/text";

export const metadata: Metadata = { robots: { index: false } };

export default async function AdminEditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("news.publish", "news.update", "news.archive");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const article = await getArticleForEdit(id, access.school!.timezone);
  if (!article) notFound();
  const t = await getTranslations("admin.news");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const categories = await getNewsCategories(access.school!.id, locale);

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/news" }, { label: article.title }]} />}
        title={t("edit")}
        actions={
          <>
            {article.status === "review" && can(access, "news.publish") ? (
              <FormDialog action={returnArticleAction} trigger={<Button variant="secondary">{t("return")}</Button>} title={t("returnTitle")} description={t("returnDescription")} submitLabel={t("return")}>
                <input type="hidden" name="id" value={article.id} />
                <TextAreaField name="reason" label={t("returnReason")} required rows={4} maxLength={500} />
              </FormDialog>
            ) : null}
            {article.status === "draft" && can(access, "news.archive") ? (
              <ConfirmAction
                action={deleteDraftArticleAction}
                fields={{ id: article.id, returnTo: "admin" }}
                title={t("deleteTitle")}
                description={t("deleteDescription")}
                confirmLabel={tc("delete")}
                trigger={<Button variant="danger-outline">{tc("delete")}</Button>}
              />
            ) : null}
          </>
        }
      />
      {article.status === "review" ? <Alert tone="info" className="mb-4">{t("inReviewHint")}</Alert> : null}
      <NewsEditor
        article={article}
        schoolId={access.school!.id}
        categories={categories.filter((c) => c.isActive || c.id === article.categoryId).map((c) => ({ value: c.id, label: c.name }))}
        canPublish={can(access, "news.publish")}
        canArchive={can(access, "news.archive")}
        isEditor
        returnTo="admin"
      />
    </>
  );
}
