"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Eye, Pin } from "lucide-react";
import Link from "next/link";
import type { NewsArticle } from "./actions";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function NewsGrid({ articles }: { articles: NewsArticle[] }) {
  const t = useTranslations("news");

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((article) => (
        <Link key={article.id} href={`/news/${article.id}`}>
          <Card className="h-full overflow-hidden transition-shadow duration-200 hover:shadow-lg">
            {article.coverImageUrl && (
              <div className="aspect-video w-full overflow-hidden bg-neutral-100">
                <img
                  src={article.coverImageUrl}
                  alt={article.title}
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2">
                {article.isPinned && (
                  <Badge variant="default" className="gap-1">
                    <Pin className="h-3 w-3" />
                    {t("pinned")}
                  </Badge>
                )}
              </div>
              <h3 className="mb-2 line-clamp-2 text-base font-semibold text-neutral-900">
                {article.title}
              </h3>
              <p className="mb-3 line-clamp-3 text-sm text-neutral-500">
                {article.content.replace(/<[^>]*>/g, "").slice(0, 150)}
              </p>
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <div className="flex items-center gap-2">
                  <Avatar
                    fallback={`${article.author.firstName.charAt(0)}${article.author.lastName.charAt(0)}`}
                    className="h-5 w-5 text-[8px]"
                  />
                  <span>{article.author.firstName} {article.author.lastName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {article.viewCount}
                  </span>
                  <span>{article.publishedAt ? formatDate(article.publishedAt) : formatDate(article.createdAt)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
