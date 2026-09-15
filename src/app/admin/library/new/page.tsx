import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { BookForm } from "@/features/admin/content/book-form";
import { getBookFormOptions } from "@/features/admin/content/library-options";
import { PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import type { Locale } from "@/lib/i18n/text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.library");
  return { title: t("new") };
}

export default async function NewBookPage() {
  const access = await requirePermission("library.create");
  const t = await getTranslations("admin.library");
  const locale = (await getLocale()) as Locale;
  const options = await getBookFormOptions(access.school!.id, locale);
  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/library" }, { label: t("new") }]} />} title={t("new")} />
      <BookForm book={null} schoolId={access.school!.id} {...options} canPublish={can(access, "library.publish")} canArchive={can(access, "library.archive")} />
    </>
  );
}
