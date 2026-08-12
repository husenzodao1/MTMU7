"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { togglePagePublishAction, deletePageAction } from "./actions";
import Link from "next/link";
import { FileText, Eye, EyeOff, Trash2, Edit } from "lucide-react";

interface PageItem {
  id: string;
  slug: string;
  titleTg: string;
  titleRu: string | null;
  isPublished: boolean;
  blocksCount: number;
}

export function PagesList({ pages }: { pages: PageItem[] }) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");

  if (pages.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-12 w-12" />}
        title={tCommon("noData")}
        description={t("noPagesYet")}
      />
    );
  }

  return (
    <div className="space-y-3">
      {pages.map((page) => (
        <Card key={page.id} className="animate-in">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-neutral-400" />
              <div>
                <p className="font-medium text-neutral-800">{page.titleTg}</p>
                <p className="text-sm text-neutral-500">
                  /{page.slug} · {page.blocksCount} blocks
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={page.isPublished ? "default" : "secondary"}>
                {page.isPublished ? t("published") : t("draft")}
              </Badge>
              <form
                action={togglePagePublishAction.bind(
                  null,
                  page.id,
                  !page.isPublished
                )}
              >
                <Button type="submit" variant="ghost" size="icon">
                  {page.isPublished ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </form>
              <Link href={`/admin/content/${page.id}`}>
                <Button variant="ghost" size="icon">
                  <Edit className="h-4 w-4" />
                </Button>
              </Link>
              <form action={deletePageAction.bind(null, page.id)}>
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  className="text-red-500 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
