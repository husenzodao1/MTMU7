import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { PeopleImportWizard } from "@/features/admin/import/people-wizard";
import { Card, CardBody, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.staff");
  return { title: t("import") };
}

export default async function ImportStaffPage() {
  await requirePermission("staff.create");
  const t = await getTranslations("admin.staff");
  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/staff" }, { label: t("import") }]} />} title={t("import")} description={t("importDescription")} />
      <Card>
        <CardBody>
          <PeopleImportWizard kind="staff" />
        </CardBody>
      </Card>
    </>
  );
}
