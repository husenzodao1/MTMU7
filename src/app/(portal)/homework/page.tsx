import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { NotebookPen } from "lucide-react";
import { ChildSwitcher } from "@/features/academic/child-switcher";
import { resolveStudentContext } from "@/features/academic/student-context";
import { WorkCard } from "@/features/academic/work-card";
import { StatusBadge } from "@/components/ui/badge";
import { Card, EmptyState, PageHeader } from "@/components/ui/surface";
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
        <section className="mb-6" aria-labelledby="journal-title">
          <h2 id="journal-title" className="text-base font-semibold text-ink">
            {t("journalTitle")}
          </h2>
          <p className="mb-3 text-sm text-ink-muted">{t("journalHint")}</p>
          <ul className="work-list">
            {journal.map((line) => {
              const subject = pickName(line.class_subjects.subjects, locale);
              return (
                <WorkCard
                  key={line.id}
                  eyebrow={
                    <>
                      <span className="work-chip">{subject}</span>
                      <span className="tabular">{formatDate(line.lesson_date, locale)}</span>
                    </>
                  }
                  title={line.topic}
                >
                  <p className="whitespace-pre-line">{line.homework}</p>
                </WorkCard>
              );
            })}
          </ul>
        </section>
      ) : null}
      {rows.length === 0 ? (
        <Card as="div">
          <EmptyState icon={<NotebookPen />} title={t("nothingDue")} />
        </Card>
      ) : (
        <ul className="work-list" aria-label={t("title")}>
          {rows.map((r) => (
            <WorkCard
              key={r.id}
              href={`/homework/${r.id}${childQuery}`}
              eyebrow={<span className="work-chip">{r.subject}</span>}
              title={r.title}
              side={<StatusBadge status={r.status} label={ts(r.status)} />}
            >
              {r.pages ? (
                <p>
                  {t("pages")}: {r.pages}
                </p>
              ) : null}
              <p className="tabular">
                {t("dueLabel")}: {r.dueAt ? formatDateTime(r.dueAt, locale) : "—"}
              </p>
            </WorkCard>
          ))}
        </ul>
      )}
    </>
  );
}
