import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ShieldAlert } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/surface";

export const metadata = { robots: { index: false } };

export default async function AccessDeniedPage() {
  const t = await getTranslations("common.accessDenied");
  return (
    <Card as="div" className="mx-auto max-w-xl">
      <EmptyState
        icon={<ShieldAlert />}
        title={t("title")}
        description={t("description")}
        action={
          <Link href="/dashboard" className={buttonClasses("secondary")}>
            {t("home")}
          </Link>
        }
      />
    </Card>
  );
}
