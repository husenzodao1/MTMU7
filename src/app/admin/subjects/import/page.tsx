import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { SubjectsImportWizard } from "@/features/admin/import/subjects-wizard";
import { Card, CardBody, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.subjects");
  return { title: t("import") };
}

export default async function ImportSubjectsPage() {
  await requirePermission("subjects.manage");
  const t = await getTranslations("admin.subjects");
  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/subjects" }, { label: t("import") }]} />}
        title={t("import")}
        description={t("importDescription")}
      />
      <Card>
        <CardBody>
          <SubjectsImportWizard />
        </CardBody>
      </Card>
    </>
  );
}
