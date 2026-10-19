import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Archive, BookOpenCheck, FileDown, FileText, School, Users } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { fullName } from "@/features/admin/queries";
import { compareClassNames } from "@/features/academic/class-order";
import { Badge } from "@/components/ui/badge";
import { TabNav } from "@/components/ui/misc";
import { Card, EmptyState, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("archive") };
}

type Person = { first_name: string; last_name: string; middle_name: string | null };
type Tab = "classes" | "journals" | "documents";

/**
 * The school's archive, year by year: every class the school had, with the
 * pupils who studied in it; every journal kept for those classes; and the
 * documents of the year — kept as they were, to be read, not changed.
 *
 * The years turn over by themselves (00086) and nothing of an old year is
 * thrown away; this is where an old year is looked at. The year in progress is
 * here too, as the newest.
 */
export default async function ArchivePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("classes.view", "grades.view", "grades.approve", "grades.update", "reports.view");
  const t = await getTranslations("admin.archive");
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const schoolId = access.school!.id;
  const timeZone = access.school!.timezone;
  const supabase = await createClient();

  const { data: years } = await supabase
    .from("academic_years")
    .select("id, name, start_date, end_date, is_current")
    .eq("school_id", schoolId)
    .order("start_date", { ascending: false });
  const all = years ?? [];
  const wanted = firstValue(params.year);
  const year = all.find((y) => y.id === wanted) ?? all.find((y) => y.is_current) ?? all[0] ?? null;
  const tabRaw = firstValue(params.tab);
  const tab: Tab = tabRaw === "journals" || tabRaw === "documents" ? tabRaw : "classes";
  const href = (next: { year?: string; tab?: Tab }) => {
    const query = new URLSearchParams();
    const y = next.year ?? year?.id;
    const tb = next.tab ?? tab;
    if (y) query.set("year", y);
    if (tb !== "classes") query.set("tab", tb);
    const text = query.toString();
    return `/admin/archive${text ? `?${text}` : ""}`;
  };

  const header = (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />} title={t("title")} description={t("description")} />
      {all.length > 0 ? (
        <nav className="archive-years" aria-label={t("years")}>
          {all.map((y) => (
            <Link key={y.id} href={href({ year: y.id })} aria-current={y.id === year?.id ? "page" : undefined}>
              {y.name}
              {y.is_current ? <span className="archive-now">{t("now")}</span> : null}
            </Link>
          ))}
        </nav>
      ) : null}
      {year ? (
        <TabNav
          label={t("views")}
          items={[
            { href: href({ tab: "classes" }), label: t("classes"), active: tab === "classes" },
            { href: href({ tab: "journals" }), label: t("journals"), active: tab === "journals" },
            { href: href({ tab: "documents" }), label: t("documents"), active: tab === "documents" },
          ]}
        />
      ) : null}
    </>
  );

  if (!year) {
    return (
      <>
        {header}
        <Card as="div">
          <EmptyState icon={<Archive />} title={t("empty")} />
        </Card>
      </>
    );
  }

  if (tab === "classes") {
    const { data: classes } = await supabase
      .from("classes")
      .select("id, name, grade_level, staff:homeroom_staff_id(first_name, last_name, middle_name), enrollments(status)")
      .eq("school_id", schoolId)
      .eq("academic_year_id", year.id);
    // Whoever studied in the class that year: still there, finished it, or moved on.
    const rows = (classes ?? [])
      .map((c) => ({
        id: c.id,
        name: c.name,
        homeroom: c.staff ? fullName(c.staff as unknown as Person) : null,
        pupils: ((c.enrollments ?? []) as Array<{ status: string }>).length,
      }))
      .filter((c) => c.pupils > 0)
      .sort((a, b) => compareClassNames(a.name, b.name));
    return (
      <>
        {header}
        {rows.length === 0 ? (
          <Card as="div">
            <EmptyState icon={<School />} title={t("noClasses")} />
          </Card>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/archive/${r.id}`} className="archive-tile">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-2xl font-semibold tracking-tight text-ink">{r.name}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-ink-muted tabular">
                      <Users className="size-3.5" aria-hidden />
                      {r.pupils}
                    </span>
                  </span>
                  <span className="truncate text-xs text-ink-muted">{r.homeroom ?? t("noHomeroom")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  if (tab === "journals") {
    const { data: journals } = await supabase
      .from("class_subjects")
      .select("id, group_label, subjects(name_tg, name_ru, name_en), staff:teacher_id(first_name, last_name, middle_name), classes!inner(id, name, academic_year_id)")
      .eq("school_id", schoolId)
      .eq("classes.academic_year_id", year.id);
    const byClass = new Map<string, { name: string; items: Array<{ id: string; subject: string; teacher: string | null }> }>();
    for (const row of journals ?? []) {
      const klass = row.classes as unknown as { id: string; name: string };
      const entry = byClass.get(klass.id) ?? { name: klass.name, items: [] };
      entry.items.push({
        id: row.id,
        subject: [pickName(row.subjects as unknown as { name_tg: string; name_ru: string | null; name_en: string | null }, locale), row.group_label]
          .filter(Boolean)
          .join(" · "),
        teacher: row.staff ? fullName(row.staff as unknown as Person) : null,
      });
      byClass.set(klass.id, entry);
    }
    const groups = [...byClass.entries()].sort((a, b) => compareClassNames(a[1].name, b[1].name));
    return (
      <>
        {header}
        {groups.length === 0 ? (
          <Card as="div">
            <EmptyState icon={<BookOpenCheck />} title={t("noJournals")} />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {groups.map(([classId, group]) => (
              <section key={classId} className="archive-group" aria-label={group.name}>
                <h2 className="archive-group-title">
                  <Link href={`/admin/archive/${classId}`}>{group.name}</Link>
                </h2>
                <ul>
                  {group.items
                    .sort((a, b) => a.subject.localeCompare(b.subject))
                    .map((item) => (
                      <li key={item.id}>
                        <Link href={`/teach/gradebook/${item.id}`} className="archive-row">
                          <BookOpenCheck className="size-4 shrink-0 text-brand-text" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">{item.subject}</span>
                            {item.teacher ? <span className="block truncate text-xs text-ink-muted">{item.teacher}</span> : null}
                          </span>
                        </Link>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </>
    );
  }

  // The year's documents: whatever the school filed between the first and the
  // last day of the year, drafts aside; and each class's report cards.
  const [{ data: documents }, { data: classes }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, category, status, file_name, created_at")
      .eq("school_id", schoolId)
      .neq("status", "draft")
      .gte("created_at", `${year.start_date}T00:00:00Z`)
      .lte("created_at", `${year.end_date}T23:59:59Z`)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("classes").select("id, name, enrollments(status)").eq("school_id", schoolId).eq("academic_year_id", year.id),
  ]);
  const reportClasses = (classes ?? [])
    .filter((c) => ((c.enrollments ?? []) as unknown[]).length > 0)
    .sort((a, b) => compareClassNames(a.name, b.name));
  const tc = await getTranslations("portal.documents");

  return (
    <>
      {header}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="archive-docs">
          <h2 id="archive-docs" className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            {t("schoolDocuments")}
          </h2>
          {(documents ?? []).length === 0 ? (
            <Card as="div">
              <EmptyState icon={<FileText />} title={t("noDocuments")} />
            </Card>
          ) : (
            <ul className="archive-group">
              {(documents ?? []).map((d) => (
                <li key={d.id}>
                  <a href={`/files/documents/${d.id}`} target="_blank" rel="noopener" data-instant="off" className="archive-row">
                    <FileText className="size-4 shrink-0 text-brand-text" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{d.title}</span>
                      <span className="block truncate text-xs text-ink-muted">
                        {[tc.has(`categories.${d.category}`) ? tc(`categories.${d.category}`) : d.category, formatDate(d.created_at, locale, timeZone)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {d.status === "archived" ? <Badge tone="neutral">{t("archived")}</Badge> : null}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="archive-reports">
          <h2 id="archive-reports" className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            {t("reportCards")}
          </h2>
          {reportClasses.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("noClasses")}</p>
          ) : (
            <ul className="archive-group">
              {reportClasses.map((c) => (
                <li key={c.id}>
                  <a href={`/report-cards?class=${c.id}`} target="_blank" rel="noopener" data-instant="off" className="archive-row">
                    <FileDown className="size-4 shrink-0 text-brand-text" aria-hidden />
                    <span className="flex-1 text-sm font-medium text-ink">{t("reportCardsOf", { name: c.name })}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
