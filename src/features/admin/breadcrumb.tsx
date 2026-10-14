import { getTranslations } from "next-intl/server";
import { Breadcrumb } from "@/components/ui/surface";

/** Breadcrumb rooted at the Admin Control Center. */
export async function AdminBreadcrumb({ items }: { items: Array<{ label: string; href?: string }> }) {
  const t = await getTranslations("admin.nav");
  return <Breadcrumb label={t("breadcrumb")} items={[{ label: t("title"), href: "/admin" }, ...items]} />;
}
