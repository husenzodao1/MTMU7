import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { NewPersonForm } from "@/features/admin/people/new-person-form";
import { getGrantableRoles } from "@/features/admin/people/grantable-roles";
import { getClassOptions } from "@/features/admin/queries";
import { Card, CardBody, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import type { Locale } from "@/lib/i18n/text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.students");
  return { title: t("new") };
}

export default async function NewStudentPage() {
  const access = await requirePermission("students.create");
  const [t, locale] = await Promise.all([getTranslations("admin.students"), getLocale()]);
  const [roles, classes] = await Promise.all([
    getGrantableRoles(locale as Locale),
    getClassOptions(access.school!.id),
  ]);
  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/students" }, { label: t("new") }]} />}
        title={t("new")}
        description={t("newDescription")}
      />
      <Card className="max-w-4xl">
        <CardBody>
          <NewPersonForm kind="students" roles={roles} classes={classes.map(({ value, label }) => ({ value, label }))} />
        </CardBody>
      </Card>
    </>
  );
}
