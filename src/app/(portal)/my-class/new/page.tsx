import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AccountForm } from "@/features/accounts/account-form";
import { gradeLimits, myHomeroomClasses } from "@/features/accounts/queries";
import { PageHeader } from "@/components/ui/surface";
import { requireAccess } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("accounts");
  return { title: t("newPupil"), robots: { index: false } };
}

export default async function NewPupilPage() {
  const access = await requireAccess();
  const classes = await myHomeroomClasses(access);
  if (classes.length === 0) redirect("/my-class");
  const t = await getTranslations("accounts");
  const limits = await gradeLimits(access.school!.id);
  return (
    <>
      <PageHeader title={t("newPupil")} description={t("myClassDescription")} />
      <AccountForm
        details={null}
        basePath="/my-class"
        allowedKinds={["student"]}
        classes={classes}
        parentRequiredMaxGrade={limits.required}
        parentManagedMaxGrade={limits.managed}
        defaultKind="student"
      />
    </>
  );
}
