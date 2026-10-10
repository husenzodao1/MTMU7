import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { NewsEditor } from "@/features/news/editor";
import { getNewsCategories } from "@/features/news/queries";
import { Breadcrumb, PageHeader } from "@/components/ui/surface";
import { can, canAny } from "@/lib/auth/access";
import { requireModule } from "@/lib/auth/guards";
import type { Locale } from "@/lib/i18n/text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portal.news");
  return { title: t("newArticle") };
}

export default async function NewArticlePage() {
  const access = await requireModule("news");
  if (!can(access, "news.create")) redirect("/access-denied");
  const t = await getTranslations("portal.news");
  const locale = (await getLocale()) as Locale;
  const categories = await getNewsCategories(access.school!.id, locale);

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb label={t("breadcrumb")} items={[{ label: t("myArticles"), href: "/news/mine" }, { label: t("newArticle") }]} />}
        title={t("newArticle")}
      />
      <NewsEditor
        article={null}
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
