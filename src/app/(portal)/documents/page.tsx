import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { FileText, FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filters";
import { EmptyState, PageHeader } from "@/components/ui/surface";
import { Pagination } from "@/components/ui/pagination";
import { can } from "@/lib/auth/access";
import { requireModule } from "@/lib/auth/guards";
import { formatDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { ilikePattern, parseListParams, type SearchParams } from "@/lib/list-params";
import { formatBytes } from "@/lib/storage/files";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_CATEGORIES } from "@/features/content/constants";


export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("documents") };
}

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireModule("documents");
  if (!can(access, "documents.view")) redirect("/access-denied");
  const t = await getTranslations("portal.documents");
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const list = parseListParams(params, { sorts: ["recent"], defaultSort: "recent", filters: { category: DOCUMENT_CATEGORIES } });

  const supabase = await createClient();
  let query = supabase
    .from("documents")
    .select("id, title, description, category, mime_type, size_bytes, published_at, current_version, document_folders(name)", { count: "exact" })
    .eq("school_id", access.school!.id)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .range(list.offset, list.offset + list.pageSize - 1);
  if (list.query) query = query.ilike("title", ilikePattern(list.query));
  if (list.filters.category) query = query.eq("category", list.filters.category);
  const { data, count } = await query;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <FilterBar
        searchLabel={t("search")}
        filters={[{ name: "category", label: t("category"), options: DOCUMENT_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) })) }]}
      />
      <DataTable
        caption={t("title")}
        rows={data ?? []}
        rowKey={(d) => d.id}
        empty={<EmptyState icon={<FolderOpen />} title={t("empty")} />}
        columns={[
          {
            key: "title",
            header: t("document"),
            primary: true,
            cell: (d) => (
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
                <div className="min-w-0">
                  <a href={`/files/documents/${d.id}`} className="font-medium text-ink hover:text-brand-text hover:underline" target="_blank" rel="noopener">
                    {d.title}
                  </a>
                  {d.description ? <p className="line-clamp-2 text-sm text-ink-muted">{d.description}</p> : null}
                </div>
              </div>
            ),
          },
          { key: "category", header: t("category"), cell: (d) => <Badge>{t(`categories.${d.category}`)}</Badge> },
          { key: "folder", header: t("folder"), hideOnMobile: true, cell: (d) => (d.document_folders as { name: string } | null)?.name ?? "—" },
          { key: "date", header: t("published"), cell: (d) => <span className="tabular">{formatDate(d.published_at, locale)}</span> },
          {
            key: "download",
            header: t("file"),
            align: "end",
            cell: (d) => (
              <a href={`/files/documents/${d.id}?download=1`} className="text-sm font-medium text-brand-text hover:underline">
                {t("download", { size: formatBytes(d.size_bytes) })}
              </a>
            ),
          },
        ]}
      />
      <Pagination pathname="/documents" searchParams={params} page={list.page} pageSize={list.pageSize} total={count ?? 0} />
    </>
  );
}
