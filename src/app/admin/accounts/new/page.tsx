import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { getClassOptions } from "@/features/admin/queries";
import { allowedKinds } from "@/features/accounts/access";
import { AccountForm } from "@/features/accounts/account-form";
import { gradeLimits } from "@/features/accounts/queries";
import { ACCOUNT_KINDS, type AccountKind } from "@/features/accounts/types";
import { PageHeader } from "@/components/ui/surface";
import { requireAdminArea } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("accounts");
  return { title: t("new") };
}

export default async function NewAccountPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const access = await requireAdminArea();
  const kinds = allowedKinds(access, "school");
  if (kinds.length === 0) redirect("/access-denied");
  const t = await getTranslations("accounts");
  const { kind } = await searchParams;
  const [classes, limits] = await Promise.all([getClassOptions(access.school!.id), gradeLimits(access.school!.id)]);
  const chosen = (ACCOUNT_KINDS as readonly string[]).includes(kind ?? "") && kinds.includes(kind as AccountKind) ? (kind as AccountKind) : kinds[0];

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/accounts" }, { label: t("new") }]} />}
        title={t("new")}
        description={t("description")}
      />
      <AccountForm
        details={null}
        basePath="/admin/accounts"
        allowedKinds={kinds}
        classes={classes}
        parentRequiredMaxGrade={limits.required}
        parentManagedMaxGrade={limits.managed}
        defaultKind={chosen}
      />
    </>
  );
}
