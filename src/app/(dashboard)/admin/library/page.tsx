import { requireAdmin } from "@/lib/admin/guard";
import { hasPermission } from "@/lib/permissions/check";
import { ErrorState } from "@/components/ui/error-state";
import { getTranslations } from "next-intl/server";
import { getAdminCategories } from "./actions";
import { CategoryManager } from "./category-manager";

export default async function AdminLibraryPage() {
  await requireAdmin();
  const t = await getTranslations("library");

  const canManage = await hasPermission("library.manage");
  if (!canManage) {
    return (
      <ErrorState
        title={t("moduleDisabled")}
        description={t("noAccess")}
      />
    );
  }

  const categories = await getAdminCategories();

  return (
    <div className="space-y-6">
      <CategoryManager categories={categories} />
    </div>
  );
}
