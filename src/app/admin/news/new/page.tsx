import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { NewsEditor } from "@/features/news/editor";
import { getNewsCategories } from "@/features/news/queries";
import { PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import type { Locale } from "@/lib/i18n/text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.news");
  return { title: t("new") };
}

export default async function AdminNewArticlePage() {
  const access = await requirePermission("news.publish", "news.update");
  const t = await getTranslations("admin.news");
  const locale = (await getLocale()) as Locale;
  const categories = await getNewsCategories(access.school!.id, locale);
  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/news" }, { label: t("new") }]} />} title={t("new")} />
      <NewsEditor
        article={null}
        schoolId={access.school!.id}
        categories={categories.filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name }))}
        canPublish={can(access, "news.publish")}
        canArchive={can(access, "news.archive")}
        isEditor
        returnTo="admin"
      />
    </>
  );
}
