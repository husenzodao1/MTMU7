import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PeopleImportWizard } from "@/features/admin/import/people-wizard";
import { gradeLimits, myHomeroomClasses } from "@/features/accounts/queries";
import { Card, CardBody, PageHeader } from "@/components/ui/surface";
import { requireAccess } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("accounts");
  return { title: t("importMyClass"), robots: { index: false } };
}

/**
 * The class teacher's own workbook: the pupils of their class with their
 * fathers and mothers, imported the way the office imports the school's, and
 * handed back with every pupil's and parent's login and password. A row of
 * another class is refused (import_people, 00088).
 */
export default async function ImportMyClassPage() {
  const access = await requireAccess();
  const classes = await myHomeroomClasses(access);
  if (classes.length === 0) redirect("/my-class");
  const t = await getTranslations("accounts");
  const limits = await gradeLimits(access.school!.id);
  return (
    <>
      <PageHeader title={t("importMyClass")} description={t("importMyClassHint", { classes: classes.map((c) => c.label).join(", ") })} />
      <Card>
        <CardBody>
          <PeopleImportWizard kind="students" parentManagedMaxGrade={limits.managed} backHref="/my-class" />
        </CardBody>
      </Card>
    </>
  );
}
