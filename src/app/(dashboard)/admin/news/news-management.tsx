"use client";

import { useState, useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateArticleStatusAction, deleteArticleAction, type NewsArticle } from "../../news/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Newspaper, Check, X, Eye, Trash2, Pin } from "lucide-react";
import Link from "next/link";

const statusTabs = ["all", "submitted", "in_review", "draft", "published", "rejected"] as const;

export function NewsManagement({ articles }: { articles: NewsArticle[] }) {
  const t = useTranslations();
  const [filter, setFilter] = useState<string>("all");
  const [rejectionDialog, setRejectionDialog] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const [statusState, statusAction, statusPending] = useActionState(updateArticleStatusAction, {
    error: null,
    success: false,
  });
  const [deleteState, deleteAction, deletePending] = useActionState(deleteArticleAction, {
    error: null,
    success: false,
  });

  void statusState;
  void deleteState;

  const filtered = filter === "all" ? articles : articles.filter((a) => a.status === filter);

  const statusColors: Record<string, string> = {
    draft: "bg-neutral-100 text-neutral-600",
    submitted: "bg-blue-100 text-blue-700",
    in_review: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    published: "bg-green-50 text-green-700 border border-green-200",
    rejected: "bg-red-100 text-red-700",
  };

  const counts: Record<string, number> = {};
  for (const a of articles) {
    counts[a.status] = (counts[a.status] ?? 0) + 1;
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-neutral-200 bg-white p-1">
        {statusTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === tab
                ? "bg-primary-50 text-primary-700"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {tab === "all" ? t("admin.allUsers") : t(`news.status_${tab}`)}
            {tab !== "all" && counts[tab] ? ` (${counts[tab]})` : ""}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Newspaper className="h-12 w-12" />}
          title={t("news.noNews")}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((article) => (
            <Card key={article.id}>
              <CardContent className="flex items-start gap-4 p-4">
                {article.coverImageUrl && (
                  <div className="hidden h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-neutral-100 sm:block">
                    <img src={article.coverImageUrl} alt="" className="h-full w-full object-cover" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge className={statusColors[article.status] ?? ""}>
                      {t(`news.status_${article.status}`)}
                    </Badge>
                    {article.isPinned && (
                      <Pin className="h-3.5 w-3.5 text-primary-500" />
                    )}
                  </div>
                  <Link href={`/news/${article.id}`}>
                    <h3 className="text-sm font-semibold text-neutral-900 hover:text-primary-600">
                      {article.title}
                    </h3>
                  </Link>
                  <div className="mt-1 flex items-center gap-3 text-xs text-neutral-400">
                    <div className="flex items-center gap-1">
                      <Avatar
                        fallback={`${article.author.firstName.charAt(0)}${article.author.lastName.charAt(0)}`}
                        className="h-4 w-4 text-[7px]"
                      />
                      <span>{article.author.firstName} {article.author.lastName}</span>
                    </div>
                    <span>{new Date(article.createdAt).toLocaleDateString()}</span>
                    <span className="flex items-center gap-0.5">
                      <Eye className="h-3 w-3" />
                      {article.viewCount}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 gap-1.5">
                  {(article.status === "submitted" || article.status === "in_review") && (
                    <>
                      <form action={statusAction}>
                        <input type="hidden" name="articleId" value={article.id} />
                        <input type="hidden" name="status" value="published" />
                        <Button type="submit" size="sm" variant="default" disabled={statusPending} className="gap-1">
                          <Check className="h-3.5 w-3.5" />
                          {t("news.publish")}
                        </Button>
                      </form>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRejectionDialog(article.id)}
                        className="gap-1 text-red-600 hover:text-red-700"
                      >
                        <X className="h-3.5 w-3.5" />
                        {t("news.reject")}
                      </Button>
                    </>
                  )}
                  {article.status === "draft" && (
                    <form action={deleteAction}>
                      <input type="hidden" name="articleId" value={article.id} />
                      <Button type="submit" size="sm" variant="ghost" disabled={deletePending} className="text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </form>
                  )}
                </div>
              </CardContent>

              {/* Rejection dialog inline */}
              {rejectionDialog === article.id && (
                <div className="border-t border-neutral-100 bg-neutral-50 p-4">
                  <form action={statusAction}>
                    <input type="hidden" name="articleId" value={article.id} />
                    <input type="hidden" name="status" value="rejected" />
                    <div className="mb-2">
                      <label className="mb-1 block text-sm font-medium text-neutral-700">
                        {t("news.rejectionReason")} *
                      </label>
                      <Input
                        name="rejectionReason"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        required
                        placeholder={t("admin.rejectionReasonPlaceholder")}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" variant="destructive" disabled={statusPending || !rejectionReason}>
                        {t("news.reject")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRejectionDialog(null);
                          setRejectionReason("");
                        }}
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </form>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
