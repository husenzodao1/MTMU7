import { requireAdmin } from "@/lib/admin/guard";
import { hasPermission } from "@/lib/permissions/check";
import { ErrorState } from "@/components/ui/error-state";
import { getTranslations } from "next-intl/server";
import { getAdminBooks } from "./actions";
import { BooksTable } from "./books-table";

export default async function AdminBooksPage() {
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

  const books = await getAdminBooks();

  return <BooksTable books={books} />;
}
