import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SearchIcon } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { searchAdmin } from "@/features/admin/search/query";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/fields";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { requireAdminArea } from "@/lib/auth/guards";
import { firstValue, type SearchParams } from "@/lib/list-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.search");
  return { title: t("title"), robots: { index: false } };
}

export default async function AdminSearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireAdminArea();
  const t = await getTranslations("admin.search");
  const params = await searchParams;
  const query = (firstValue(params.q) ?? "").slice(0, 100);
  const sections = query.trim().length >= 2 ? await searchAdmin(access, query) : [];
  const total = sections.reduce((sum, section) => sum + section.hits.length, 0);

  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />} title={t("title")} description={t("description")} />
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <TextField name="q" label={t("field")} defaultValue={query} maxLength={100} autoFocus placeholder={t("placeholder")} className="min-w-64 flex-1" />
        <Button type="submit">{t("submit")}</Button>
      </form>

      {query.trim().length < 2 ? (
        <Card as="div"><EmptyState icon={<SearchIcon />} title={t("hint")} /></Card>
      ) : total === 0 ? (
        <Card as="div"><EmptyState icon={<SearchIcon />} title={t("empty", { query })} /></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {sections.map((section) => (
            <Card key={section.key}>
              <CardHeader title={t(`sections.${section.key}`)} description={section.more ? t("more") : undefined} />
              <CardBody className="p-0">
                <ul className="divide-y divide-line">
                  {section.hits.map((hit) => (
                    <li key={hit.id}>
                      <Link href={hit.href} className="flex items-baseline justify-between gap-3 px-5 py-3 hover:bg-surface-muted">
                        <span className="min-w-0 truncate font-medium text-ink">{hit.title}</span>
                        {hit.detail ? <span className="shrink-0 text-sm text-ink-muted">{hit.detail}</span> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
