import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { ImportWizard } from "@/features/admin/import/wizard";
import { Card, CardBody, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.classes");
  return { title: t("import") };
}

export default async function ImportClassesPage() {
  await requirePermission("classes.create");
  const t = await getTranslations("admin.classes");
  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/classes" }, { label: t("import") }]} />} title={t("import")} description={t("importDescription")} />
      <Card>
        <CardBody>
          <ImportWizard kind="classes" />
        </CardBody>
      </Card>
    </>
  );
}
