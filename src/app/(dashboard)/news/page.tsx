import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getPublishedNews } from "./actions";
import { NewsGrid } from "./news-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Newspaper, Plus } from "lucide-react";
import Link from "next/link";

export default async function NewsPage() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const t = await getTranslations();
  const articles = await getPublishedNews();
  const isAdmin = user.roles.some((r) => r.slug === "admin" || r.slug === "director" || r.slug === "vice_principal");
  const canCreate = user.roles.some((r) => ["admin", "director", "vice_principal", "teacher"].includes(r.slug));

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">{t("news.title")}</h1>
        <div className="flex gap-2">
          {canCreate && (
            <Link href="/news/create">
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                {t("news.createArticle")}
              </Button>
            </Link>
          )}
          {isAdmin && (
            <Link href="/admin/news">
              <Button size="sm" variant="outline">
                {t("news.newsManagement")}
              </Button>
            </Link>
          )}
        </div>
      </div>

      {articles.length === 0 ? (
        <EmptyState
          icon={<Newspaper className="h-16 w-16" />}
          title={t("news.noNews")}
          description={t("news.noNewsDesc")}
        />
      ) : (
        <NewsGrid articles={articles} />
      )}
    </div>
  );
}
