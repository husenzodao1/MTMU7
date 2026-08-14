import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";
import { PagesList } from "./pages-list";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";

async function getPages() {
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("pages" as never)
    .select("id, slug, title_tg, title_ru, is_published, sort_order" as never)
    .order("sort_order" as never, { ascending: true });

  const pages = (data ?? []) as Array<Record<string, unknown>>;

  const pagesWithCounts = await Promise.all(
    pages.map(async (page) => {
      const { count } = await supabase
        .from("content_blocks" as never)
        .select("id" as never, { count: "exact", head: true })
        .eq("page_id" as never, page.id as never);

      return {
        id: page.id as string,
        slug: page.slug as string,
        titleTg: page.title_tg as string,
        titleRu: (page.title_ru as string) ?? null,
        isPublished: page.is_published as boolean,
        blocksCount: count ?? 0,
      };
    })
  );

  return pagesWithCounts;
}

export default async function ContentPage() {
  await requireAdmin();
  const t = await getTranslations("admin");
  const pages = await getPages();

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-neutral-900">
            {t("content")}
          </h1>
          <Link href="/admin/content/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t("createPage")}
            </Button>
          </Link>
        </div>
        <PagesList pages={pages} />
      </div>
    </div>
  );
}
