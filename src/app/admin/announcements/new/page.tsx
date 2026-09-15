import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AnnouncementForm } from "@/features/admin/content/announcement-form";
import { getAudienceOptions } from "@/features/admin/content/announcement-options";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import type { Locale } from "@/lib/i18n/text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.announcements");
  return { title: t("new") };
}

export default async function NewAnnouncementPage() {
  const access = await requirePermission("announcements.publish");
  const t = await getTranslations("admin.announcements");
  const locale = (await getLocale()) as Locale;
  const options = await getAudienceOptions(access.school!.id, locale);
  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/announcements" }, { label: t("new") }]} />} title={t("new")} />
      <AnnouncementForm announcement={null} schoolId={access.school!.id} roles={options.roles} classes={options.classes} canPublish />
    </>
  );
}
