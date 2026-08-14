import { requireAdmin } from "@/lib/admin/guard";
import { hasPermission } from "@/lib/permissions/check";
import { ErrorState } from "@/components/ui/error-state";
import { getTranslations } from "next-intl/server";
import { getAdminCategories } from "../../actions";
import { BookForm } from "./book-form";

export default async function NewBookPage() {
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

  return <BookForm categories={categories} />;
}
