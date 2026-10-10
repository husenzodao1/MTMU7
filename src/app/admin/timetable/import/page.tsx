import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { TimetableImportWizard } from "@/features/admin/import/timetable-wizard";
import { Card, CardBody, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.timetable");
  return { title: t("import") };
}

export default async function ImportTimetablePage() {
  await requirePermission("timetable.manage");
  const t = await getTranslations("admin.timetable");
  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/timetable" }, { label: t("import") }]} />}
        title={t("import")}
        description={t("importDescription")}
      />
      <Card>
        <CardBody>
          <TimetableImportWizard />
        </CardBody>
      </Card>
    </>
  );
}
