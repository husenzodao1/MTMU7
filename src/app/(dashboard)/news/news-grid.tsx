"use client";

import { useTranslations } from "next-intl";
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

  const [featured, ...rest] = articles;

  return (
    <div className="space-y-4">
      {/* Featured / first article — large card */}
      {featured && (
        <Link href={`/news/${featured.id}`} className="block group">
          <div className="relative overflow-hidden rounded-[20px] border border-neutral-200/80 bg-white shadow-sm transition-shadow duration-200 group-hover:shadow-md">
            {featured.coverImageUrl ? (
              <div className="aspect-[16/7] w-full overflow-hidden bg-neutral-100">
                <img
                  src={featured.coverImageUrl}
                  alt={featured.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                />
              </div>
            ) : (
              <div className="aspect-[16/7] w-full bg-gradient-to-br from-indigo-50 to-indigo-100 flex items-center justify-center">
                <span className="text-4xl">📰</span>
              </div>
            )}
            <div className="p-4 sm:p-5">
              {featured.isPinned && (
                <Badge variant="default" className="mb-2 gap-1 text-[10px]">
                  <Pin className="h-2.5 w-2.5" />
                  {t("pinned")}
                </Badge>
              )}
              <h2 className="text-lg sm:text-xl font-bold text-neutral-900 line-clamp-2 mb-2">
                {featured.title}
              </h2>
              <p className="text-sm text-neutral-500 line-clamp-2 mb-3">
                {featured.content.replace(/<[^>]*>/g, "").slice(0, 200)}
              </p>
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <div className="flex items-center gap-2">
                  <Avatar
                    fallback={`${featured.author.firstName.charAt(0)}${featured.author.lastName.charAt(0)}`}
                    className="h-5 w-5 text-[8px]"
                  />
                  <span className="font-medium text-neutral-500">
                    {featured.author.firstName} {featured.author.lastName}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {featured.viewCount}
                  </span>
                  <span>
                    {featured.publishedAt ? formatDate(featured.publishedAt) : formatDate(featured.createdAt)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* Rest — compact list on mobile, 2-col grid on tablet+ */}
      {rest.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((article) => (
            <Link key={article.id} href={`/news/${article.id}`} className="block group">
              <div className="flex gap-3 overflow-hidden rounded-[16px] border border-neutral-200/80 bg-white p-3 shadow-sm transition-shadow duration-200 group-hover:shadow-md sm:flex-col sm:p-0">
                {/* Mobile: horizontal layout with small thumbnail */}
                {article.coverImageUrl ? (
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[10px] bg-neutral-100 sm:hidden">
                    <img
                      src={article.coverImageUrl}
                      alt={article.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[10px] bg-gradient-to-br from-indigo-50 to-indigo-100 flex items-center justify-center sm:hidden">
                    <span className="text-2xl">📰</span>
                  </div>
                )}

                {/* Desktop: full-width image top */}
                {article.coverImageUrl ? (
                  <div className="hidden sm:block aspect-video w-full overflow-hidden rounded-t-[16px] bg-neutral-100">
                    <img
                      src={article.coverImageUrl}
                      alt={article.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  </div>
                ) : (
                  <div className="hidden sm:flex aspect-video w-full items-center justify-center rounded-t-[16px] bg-gradient-to-br from-indigo-50 to-indigo-100">
                    <span className="text-3xl">📰</span>
                  </div>
                )}

                {/* Text content */}
                <div className="flex flex-1 flex-col justify-between min-w-0 sm:p-3">
                  {article.isPinned && (
                    <Badge variant="default" className="mb-1.5 gap-1 text-[10px] self-start">
                      <Pin className="h-2.5 w-2.5" />
                      {t("pinned")}
                    </Badge>
                  )}
                  <h3 className="text-sm font-bold text-neutral-900 line-clamp-2 mb-1">
                    {article.title}
                  </h3>
                  <p className="text-xs text-neutral-500 line-clamp-2 mb-2 hidden sm:block">
                    {article.content.replace(/<[^>]*>/g, "").slice(0, 100)}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-neutral-400">
                    <span className="font-medium text-neutral-400 truncate max-w-[100px]">
                      {article.author.firstName} {article.author.lastName}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="flex items-center gap-0.5">
                        <Eye className="h-2.5 w-2.5" />
                        {article.viewCount}
                      </span>
                      <span>
                        {article.publishedAt ? formatDate(article.publishedAt) : formatDate(article.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
