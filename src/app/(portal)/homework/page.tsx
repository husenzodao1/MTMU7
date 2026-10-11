import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { NotebookPen } from "lucide-react";
import { ChildSwitcher } from "@/features/academic/child-switcher";
import { resolveStudentContext } from "@/features/academic/student-context";
import { StatusBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { TabNav } from "@/components/ui/misc";
import { requireModule } from "@/lib/auth/guards";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
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
    .select("id, title, pages, due_at, published_at, class_subjects!inner(class_id, subjects!inner(name_tg, name_ru, name_en)), homework_submissions(status, student_id)")
    .eq("status", "published")
    .eq("class_subjects.class_id", context.classId)
    .limit(100);
  query = view === "current"
    ? query.or(`due_at.is.null,due_at.gte.${nowIso}`).order("due_at", { ascending: true, nullsFirst: false })
    : query.lt("due_at", nowIso).order("due_at", { ascending: false });
  // What the teacher wrote in the journal beside each lesson's topic: the
  // homework set that day, for the last two weeks (lesson_topics, 00041).
  const [{ data: assignments }, { data: journal }] = await Promise.all([
    query,
    view === "current"
      ? supabase
          .from("lesson_topics")
          .select("id, lesson_date, topic, homework, class_subjects!inner(class_id, subjects!inner(name_tg, name_ru, name_en))")
          .eq("class_subjects.class_id", context.classId)
          .not("homework", "is", null)
          .gte("lesson_date", requestTimeMinus(14 * 24 * 3600 * 1000).slice(0, 10))
          .order("lesson_date", { ascending: false })
          .limit(40)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const rows = (assignments ?? []).map((a) => {
    const submission = a.homework_submissions.find((s) => s.student_id === context.studentId);
    const overdue = Boolean(a.due_at && new Date(a.due_at).getTime() < getRequestTime() && !submission);
    return {
      id: a.id,
      title: a.title,
      pages: a.pages,
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
      {journal && journal.length > 0 ? (
        <Card className="mb-5">
          <CardHeader title={t("journalTitle")} description={t("journalHint")} />
          <CardBody className="p-0">
            <ul className="divide-y divide-line">
              {journal.map((line) => (
                <li key={line.id} className="px-5 py-3">
                  <p className="text-xs text-ink-muted">
                    <span className="tabular">{formatDate(line.lesson_date, locale)}</span> · {pickName(line.class_subjects.subjects, locale)}
                  </p>
                  <p className="font-medium text-ink">{line.topic}</p>
                  <p className="text-sm text-ink-secondary whitespace-pre-line">{line.homework}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
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
              <span>
                <Link href={`/homework/${r.id}${childQuery}`} className="font-medium text-ink hover:text-brand-text hover:underline">
                  {r.title}
                </Link>
                {r.pages ? <span className="block text-sm text-ink-secondary">{t("pages")}: {r.pages}</span> : null}
              </span>
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
