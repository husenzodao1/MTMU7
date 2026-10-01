import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { NotebookPen, Plus } from "lucide-react";
import { getMyClassSubjects } from "@/features/teach/queries";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filters";
import { Pagination } from "@/components/ui/pagination";
import { Breadcrumb, EmptyState, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { ilikePattern, parseListParams, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("teach.homework");
  return { title: t("title") };
}

export default async function TeachHomeworkPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("homework.create", "homework.review");
  const t = await getTranslations("teach.homework");
  const tt = await getTranslations("teach");
  const ts = await getTranslations("common.status");
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const classSubjects = await getMyClassSubjects(access.userId, locale);
  const list = parseListParams(params, {
    sorts: ["due"],
    defaultSort: "due",
    filters: { classSubject: "uuid", status: ["draft", "published", "archived"] },
  });
  const labelById = new Map(classSubjects.map((cs) => [cs.id, cs.label]));

  const supabase = await createClient();
  let rows: Array<{ id: string; title: string; status: string; due_at: string | null; class_subject_id: string; toReview: number; submitted: number }> = [];
  let total = 0;
  if (classSubjects.length > 0) {
    let query = supabase
      .from("homework_assignments")
      .select("id, title, status, due_at, class_subject_id, homework_submissions(status)", { count: "exact" })
      .in("class_subject_id", classSubjects.map((cs) => cs.id))
      .order("due_at", { ascending: false, nullsFirst: true })
      .range(list.offset, list.offset + list.pageSize - 1);
    if (list.query) query = query.ilike("title", ilikePattern(list.query));
    if (list.filters.classSubject) query = query.eq("class_subject_id", list.filters.classSubject);
    query = list.filters.status ? query.eq("status", list.filters.status) : query.neq("status", "archived");
    const { data, count } = await query;
    rows = (data ?? []).map((a) => {
      const subs = (a.homework_submissions ?? []) as Array<{ status: string }>;
      return {
        id: a.id,
        title: a.title,
        status: a.status,
        due_at: a.due_at,
        class_subject_id: a.class_subject_id,
        toReview: subs.filter((s) => s.status === "submitted" || s.status === "late").length,
        submitted: subs.filter((s) => s.status !== "missing").length,
      };
    });
    total = count ?? 0;
  }

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb label={tt("breadcrumb")} items={[{ label: tt("title"), href: "/teach" }, { label: t("title") }]} />}
        title={t("title")}
        description={t("description")}
        actions={classSubjects.length > 0 ? (
          <Link href="/teach/homework/new" className={buttonClasses("primary")}>
            <Plus aria-hidden />
            {t("new")}
          </Link>
        ) : null}
      />
      <FilterBar
        searchLabel={t("search")}
        filters={[
          { name: "classSubject", label: t("classSubject"), options: classSubjects.map((cs) => ({ value: cs.id, label: cs.label })) },
          { name: "status", label: t("status"), emptyLabel: t("activeOnly"), options: ["draft", "published", "archived"].map((s) => ({ value: s, label: ts(s) })) },
        ]}
      />
      <DataTable
        caption={t("title")}
        rows={rows}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={<NotebookPen />} title={classSubjects.length === 0 ? tt("noClasses") : t("empty")} />}
        columns={[
          {
            key: "title",
            header: t("assignmentTitle"),
            primary: true,
            cell: (r) => (
              <div>
                <Link href={`/teach/homework/${r.id}`} className="font-medium hover:text-brand-text hover:underline">{r.title}</Link>
                <p className="text-sm text-ink-muted">{labelById.get(r.class_subject_id)}</p>
              </div>
            ),
          },
          { key: "due", header: t("dueAt"), cell: (r) => <span className="tabular">{r.due_at ? formatDateTime(r.due_at, locale, access.school!.timezone) : "—"}</span> },
          { key: "status", header: t("status"), cell: (r) => <StatusBadge status={r.status} label={ts(r.status)} /> },
          {
            key: "submissions",
            header: t("submissions"),
            cell: (r) => (
              <span className="flex flex-wrap items-center gap-2 tabular">
                {r.submitted}
                {r.toReview > 0 ? <Badge tone="warning">{t("toReview", { count: r.toReview })}</Badge> : null}
              </span>
            ),
          },
        ]}
      />
      <Pagination pathname="/teach/homework" searchParams={params} page={list.page} pageSize={list.pageSize} total={total} />
    </>
  );
}
