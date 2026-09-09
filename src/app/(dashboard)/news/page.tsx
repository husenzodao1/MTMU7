import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getPublishedNews } from "./actions";
import { NewsGrid } from "./news-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Newspaper, Plus, Settings2 } from "lucide-react";
import Link from "next/link";

export default async function NewsPage() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const t = await getTranslations();
  const articles = await getPublishedNews();
  const isAdmin = user.roles.some((r) => ["admin", "director", "vice_principal"].includes(r.slug));
  const canCreate = user.roles.some((r) => ["admin", "director", "vice_principal", "teacher"].includes(r.slug));

  return (
    <div className="space-y-5 animate-in pb-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">
          {t("news.title")}
        </h1>
        <div className="flex gap-2">
          {canCreate && (
            <Link href="/news/create" className="flex-1 sm:flex-none">
              <Button size="sm" className="w-full sm:w-auto gap-1.5">
                <Plus className="h-4 w-4" />
                {t("news.createArticle")}
              </Button>
            </Link>
          )}
          {isAdmin && (
            <Link href="/admin/news" className="flex-none">
              <Button size="sm" variant="outline" className="gap-1.5">
                <Settings2 className="h-4 w-4" />
                <span className="hidden sm:inline">{t("news.newsManagement")}</span>
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
