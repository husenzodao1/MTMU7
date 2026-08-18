import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getArticleById } from "../actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, Pin, Calendar } from "lucide-react";
import Link from "next/link";

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const { articleId } = await params;
  const t = await getTranslations();
  const article = await getArticleById(articleId);

  if (!article) notFound();

  const statusColors: Record<string, string> = {
    draft: "bg-neutral-100 text-neutral-600",
    submitted: "bg-blue-100 text-blue-700",
    in_review: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    published: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-in">
      <Link href="/news">
        <Button variant="ghost" size="sm" className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          {t("common.back")}
        </Button>
      </Link>

      {article.coverImageUrl && (
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-neutral-100">
          <img
            src={article.coverImageUrl}
            alt={article.title}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {article.isPinned && (
            <Badge className="gap-1">
              <Pin className="h-3 w-3" />
              {t("news.pinned")}
            </Badge>
          )}
          <Badge className={statusColors[article.status] ?? ""}>
            {t(`news.status_${article.status}`)}
          </Badge>
        </div>

        <h1 className="text-3xl font-bold text-neutral-900">{article.title}</h1>

        <div className="mt-4 flex items-center gap-4 text-sm text-neutral-500">
          <div className="flex items-center gap-2">
            <Avatar
              fallback={`${article.author.firstName.charAt(0)}${article.author.lastName.charAt(0)}`}
            />
            <span>{article.author.firstName} {article.author.lastName}</span>
          </div>
          {article.publishedAt && (
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {new Date(article.publishedAt).toLocaleDateString()}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Eye className="h-4 w-4" />
            {article.viewCount}
          </span>
        </div>

        {article.rejectionReason && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-700">{t("news.rejectionReason")}</p>
            <p className="mt-1 text-sm text-red-600">{article.rejectionReason}</p>
          </div>
        )}
      </div>

      <div className="prose prose-neutral max-w-none whitespace-pre-wrap text-neutral-700">
        {article.content}
      </div>
    </div>
  );
}
