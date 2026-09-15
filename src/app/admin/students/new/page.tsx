import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { StudentForm } from "@/features/admin/people/student-form";
import { getClassOptions } from "@/features/admin/queries";
import { Card, CardBody, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.students");
  return { title: t("new") };
}

export default async function NewStudentPage() {
  const access = await requirePermission("students.create");
  const t = await getTranslations("admin.students");
  const classes = can(access, "enrollments.manage") ? await getClassOptions(access.school!.id) : undefined;
  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/students" }, { label: t("new") }]} />} title={t("new")} description={t("newDescription")} />
      <Card className="max-w-4xl">
        <CardBody>
          <StudentForm student={null} classes={classes?.map(({ value, label }) => ({ value, label }))} />
        </CardBody>
      </Card>
    </>
  );
}
