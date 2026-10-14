import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { UsersRound } from "lucide-react";
import { getMyChildren } from "@/features/academic/queries";
import { Avatar } from "@/components/ui/misc";
import { Card, EmptyState, PageHeader } from "@/components/ui/surface";
import { requireAccess } from "@/lib/auth/guards";
import { hasRole } from "@/lib/auth/access";
import { redirect } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("children") };
}

export default async function ChildrenPage() {
  const access = await requireAccess();
  if (!hasRole(access, "parent")) redirect("/dashboard");
  const t = await getTranslations("portal.children");
  const children = await getMyChildren();

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {children.length === 0 ? (
        <Card as="div">
          <EmptyState icon={<UsersRound />} title={t("empty")} description={t("emptyHint")} />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((child) => (
            <li key={child.id}>
              <Link href={`/children/${child.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-xs hover:border-brand-300">
                <Avatar name={`${child.firstName} ${child.lastName}`} size="lg" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{child.firstName} {child.lastName}</p>
                  <p className="text-sm text-ink-muted">{child.className ? t("class", { name: child.className }) : t("noClass")}</p>
                  {child.relationship ? <p className="text-xs text-ink-muted">{t(`relationship.${child.relationship}`)}</p> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
