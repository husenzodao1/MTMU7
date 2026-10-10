import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { NotebookPen } from "lucide-react";
import { ChildSwitcher } from "@/features/academic/child-switcher";
import { resolveStudentContext } from "@/features/academic/student-context";
import { StatusBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { Card, EmptyState, PageHeader } from "@/components/ui/surface";
import { TabNav } from "@/components/ui/misc";
import { requireModule } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { getRequestTime, requestTimeMinus } from "@/lib/request-time";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("homework") };
}

export default async function HomeworkPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireModule("homework");
  const t = await getTranslations("portal.homework");
  const ts = await getTranslations("common.status");
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const context = await resolveStudentContext(access, params);
  const view = firstValue(params.view) === "past" ? "past" : "current";

  if (!context?.classId) {
    return (
      <>
        <PageHeader title={t("title")} />
        <Card as="div"><EmptyState icon={<NotebookPen />} title={t("noStudent")} /></Card>
      </>
    );
  }

  const supabase = await createClient();
  const nowIso = requestTimeMinus(24 * 3600 * 1000);
  let query = supabase
    .from("homework_assignments")
    .select("id, title, due_at, published_at, class_subjects!inner(class_id, subjects!inner(name_tg, name_ru, name_en)), homework_submissions(status, student_id)")
    .eq("status", "published")
    .eq("class_subjects.class_id", context.classId)
    .limit(100);
  query = view === "current"
    ? query.or(`due_at.is.null,due_at.gte.${nowIso}`).order("due_at", { ascending: true, nullsFirst: false })
    : query.lt("due_at", nowIso).order("due_at", { ascending: false });
  const { data: assignments } = await query;

  const rows = (assignments ?? []).map((a) => {
    const submission = a.homework_submissions.find((s) => s.student_id === context.studentId);
    const overdue = Boolean(a.due_at && new Date(a.due_at).getTime() < getRequestTime() && !submission);
    return {
      id: a.id,
      title: a.title,
      subject: pickName(a.class_subjects.subjects, locale),
      dueAt: a.due_at,
      status: submission?.status ?? (overdue ? "missing" : "pending"),
    };
  });
  const childQuery = context.viewer === "guardian" ? `?child=${context.studentId}` : "";
  const sep = childQuery ? "&" : "?";

  return (
    <>
      <PageHeader title={t("title")} description={[`${context.firstName} ${context.lastName}`, context.className].filter(Boolean).join(" · ")} />
      <ChildSwitcher context={context} pathname="/homework" />
      <TabNav
        label={t("views")}
        items={[
          { href: `/homework${childQuery}`, label: t("current"), active: view === "current" },
          { href: `/homework${childQuery}${sep}view=past`, label: t("past"), active: view === "past" },
        ]}
      />
      <DataTable
        caption={t("title")}
        rows={rows}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={<NotebookPen />} title={t("nothingDue")} />}
        columns={[
          {
            key: "title",
            header: t("assignment"),
            primary: true,
            cell: (r) => (
              <Link href={`/homework/${r.id}${childQuery}`} className="font-medium text-ink hover:text-brand-text hover:underline">
                {r.title}
              </Link>
            ),
          },
          { key: "subject", header: t("subject"), cell: (r) => r.subject },
          { key: "due", header: t("dueLabel"), cell: (r) => <span className="tabular">{r.dueAt ? formatDateTime(r.dueAt, locale) : "—"}</span> },
          { key: "status", header: t("status"), cell: (r) => <StatusBadge status={r.status} label={ts(r.status)} /> },
        ]}
      />
    </>
  );
}
