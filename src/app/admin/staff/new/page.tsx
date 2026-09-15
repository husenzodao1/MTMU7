import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { StaffForm } from "@/features/admin/people/staff-form";
import { Card, CardBody, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.staff");
  return { title: t("new") };
}

export default async function NewStaffPage() {
  await requirePermission("staff.create");
  const t = await getTranslations("admin.staff");
  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/staff" }, { label: t("new") }]} />} title={t("new")} description={t("newDescription")} />
      <Card className="max-w-4xl">
        <CardBody>
          <StaffForm staff={null} />
        </CardBody>
      </Card>
    </>
  );
}
