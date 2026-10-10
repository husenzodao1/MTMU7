import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { NewPersonForm } from "@/features/admin/people/new-person-form";
import { getGrantableRoles } from "@/features/admin/people/grantable-roles";
import { Card, CardBody, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import type { Locale } from "@/lib/i18n/text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.staff");
  return { title: t("new") };
}

export default async function NewStaffPage() {
  await requirePermission("staff.create");
  const [t, locale] = await Promise.all([getTranslations("admin.staff"), getLocale()]);
  const roles = await getGrantableRoles(locale as Locale);
  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/staff" }, { label: t("new") }]} />}
        title={t("new")}
        description={t("newDescription")}
      />
      <Card className="max-w-4xl">
        <CardBody>
          <NewPersonForm kind="staff" roles={roles} />
        </CardBody>
      </Card>
    </>
  );
}
