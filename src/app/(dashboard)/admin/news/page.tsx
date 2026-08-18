import { requireAdmin } from "@/lib/admin/guard";
import { getTranslations } from "next-intl/server";
import { AdminNav } from "../admin-nav";
import { getAllNewsForAdmin } from "../../news/actions";
import { NewsManagement } from "./news-management";

export default async function AdminNewsPage() {
  await requireAdmin();
  const t = await getTranslations();
  const articles = await getAllNewsForAdmin();

  return (
    <div>
      <AdminNav />
      <div className="space-y-6 animate-in">
        <h1 className="text-2xl font-bold text-neutral-900">{t("news.newsManagement")}</h1>
        <NewsManagement articles={articles} />
      </div>
    </div>
  );
}
