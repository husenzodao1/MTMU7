import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Newspaper, Plus } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Alert, Breadcrumb, EmptyState, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requireModule } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portal.news");
  return { title: t("myArticles") };
}

export default async function MyArticlesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireModule("news");
  if (!can(access, "news.create")) redirect("/access-denied");
  const t = await getTranslations("portal.news");
  const ts = await getTranslations("common.status");
  const locale = (await getLocale()) as Locale;
  const saved = firstValue((await searchParams).saved);

  const supabase = await createClient();
  const { data } = await supabase
    .from("news_articles")
    .select("id, slug, title, status, updated_at, publish_at, rejection_reason")
    .eq("author_id", access.userId)
    .order("updated_at", { ascending: false })
    .limit(100);

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb label={t("breadcrumb")} items={[{ label: t("title"), href: "/news" }, { label: t("myArticles") }]} />}
        title={t("myArticles")}
        description={t("myArticlesDescription")}
        actions={
          <Link href="/news/new" className={buttonClasses("primary")}>
            <Plus aria-hidden />
            {t("newArticle")}
          </Link>
        }
      />
      {saved ? <Alert tone="success" className="mb-4">{t(`saved.${saved === "review" ? "review" : saved === "deleted" ? "deleted" : "draft"}`)}</Alert> : null}
      <DataTable
        caption={t("myArticles")}
        rows={data ?? []}
        rowKey={(a) => a.id}
        empty={<EmptyState icon={<Newspaper />} title={t("noArticles")} />}
        columns={[
          {
            key: "title",
            header: t("articleTitle"),
            primary: true,
            cell: (a) => (
              <div>
                <Link href={a.status === "published" ? `/news/${a.slug}` : `/news/edit/${a.id}`} className="font-medium hover:text-brand-text hover:underline">
                  {a.title}
                </Link>
                {a.rejection_reason && a.status === "draft" ? <p className="text-sm text-warning-700">{t("returnedShort")}</p> : null}
              </div>
            ),
          },
          { key: "status", header: t("status"), cell: (a) => <StatusBadge status={a.status} label={ts(a.status)} /> },
          { key: "updated", header: t("updated"), cell: (a) => <span className="tabular">{formatDateTime(a.updated_at, locale)}</span> },
        ]}
        actions={(a) =>
          ["draft", "review"].includes(a.status) ? (
            <Link href={`/news/edit/${a.id}`} className={buttonClasses("ghost", "sm")}>
              {t("edit")}
            </Link>
          ) : null
        }
      />
    </>
  );
}
