import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { NewsEditor } from "@/features/news/editor";
import { getArticleForEdit, getNewsCategories } from "@/features/news/queries";
import { deleteDraftArticleAction } from "@/features/news/actions";
import { ConfirmAction } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Breadcrumb, PageHeader } from "@/components/ui/surface";
import { can, canAny } from "@/lib/auth/access";
import { requireModule } from "@/lib/auth/guards";
import type { Locale } from "@/lib/i18n/text";

export const metadata: Metadata = { robots: { index: false } };

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireModule("news");
  if (!can(access, "news.create")) redirect("/access-denied");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const article = await getArticleForEdit(id, access.school!.timezone);
  if (!article) notFound();

  const t = await getTranslations("portal.news");
  const locale = (await getLocale()) as Locale;
  const categories = await getNewsCategories(access.school!.id, locale);

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb label={t("breadcrumb")} items={[{ label: t("myArticles"), href: "/news/mine" }, { label: article.title }]} />}
        title={t("editArticle")}
        actions={
          article.status === "draft" ? (
            <ConfirmAction
              action={deleteDraftArticleAction}
              fields={{ id: article.id, returnTo: "portal" }}
              title={t("deleteTitle")}
              description={t("deleteDescription")}
              confirmLabel={t("delete")}
              trigger={<Button variant="danger-outline" size="sm">{t("delete")}</Button>}
            />
          ) : null
        }
      />
      <NewsEditor
        article={article}
        schoolId={access.school!.id}
        categories={categories.filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name }))}
        canPublish={can(access, "news.publish")}
        canArchive={can(access, "news.archive")}
        isEditor={canAny(access, ["news.update", "news.publish"])}
        returnTo="portal"
      />
    </>
  );
}
