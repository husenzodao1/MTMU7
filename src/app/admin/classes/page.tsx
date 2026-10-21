import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileSpreadsheet, School, UserRound, Users } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { fullName } from "@/features/admin/queries";
import { compareClassNames } from "@/features/academic/class-order";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("classes") };
}

type Person = { first_name: string; last_name: string; middle_name: string | null };

/**
 * The school's classes, as boxes: the class, how many pupils it has and its
 * class teacher, and a tap opens its pupils.
 *
 * Nobody makes a class here. 1А … 11Д exist every year by themselves (00086);
 * the pupils' workbook puts each pupil in theirs, and the teachers' workbook
 * names the class teacher. A class with no pupils is not shown, so an 11Д the
 * school does not have this year takes no room.
 */
export default async function AdminClassesPage() {
  const access = await requirePermission("classes.view", "classes.create", "classes.update", "enrollments.manage");
  const t = await getTranslations("admin.classes");
  const schoolId = access.school!.id;
  const supabase = await createClient();

  const { data: year } = await supabase
    .from("academic_years")
    .select("id, name")
    .eq("school_id", schoolId)
    .eq("is_current", true)
    .maybeSingle();

  const { data: classes } = year
    ? await supabase
        .from("classes")
        .select("id, name, grade_level, shift, staff:homeroom_staff_id(first_name, last_name, middle_name), enrollments(status)")
        .eq("school_id", schoolId)
        .eq("academic_year_id", year.id)
        .eq("is_active", true)
    : { data: [] };

  const rows = (classes ?? [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      grade: c.grade_level,
      shift: c.shift,
      homeroom: c.staff ? fullName(c.staff as unknown as Person) : null,
      pupils: ((c.enrollments ?? []) as Array<{ status: string }>).filter((e) => e.status === "active").length,
    }))
    .filter((c) => c.pupils > 0)
    .sort((a, b) => compareClassNames(a.name, b.name));

  const grades = [...new Set(rows.map((r) => r.grade))].sort((a, b) => a - b);
  const pupils = rows.reduce((sum, r) => sum + r.pupils, 0);

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />}
        title={t("title")}
        description={year ? t("summary", { year: year.name, classes: rows.length, pupils }) : t("description")}
        actions={
          can(access, "students.import") ? (
            <Link href="/admin/students/import" className={buttonClasses("secondary")}>
              <FileSpreadsheet aria-hidden />
              {t("importPupils")}
            </Link>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <Card as="div">
          <EmptyState
            icon={<School />}
            title={t("empty")}
            description={t("emptyHint")}
            action={
              can(access, "students.import") ? (
                <Link href="/admin/students/import" className={buttonClasses("primary")}>
                  <FileSpreadsheet aria-hidden />
                  {t("importPupils")}
                </Link>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {grades.map((grade) => (
            <section key={grade} aria-labelledby={`grade-${grade}`}>
              <h2 id={`grade-${grade}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">
                {t("gradeHeading", { grade })}
              </h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {rows
                  .filter((r) => r.grade === grade)
                  .map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/admin/classes/${r.id}`}
                        className="group flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-3 shadow-xs transition-colors hover:border-brand-300 hover:bg-brand-50/40 focus-visible:outline-2 focus-visible:outline-brand-600"
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-2xl font-semibold tracking-tight text-ink group-hover:text-brand-text">{r.name}</span>
                          <span className="inline-flex items-center gap-1 text-xs text-ink-muted tabular">
                            <Users className="size-3.5" aria-hidden />
                            {r.pupils}
                          </span>
                        </span>
                        {r.homeroom ? (
                          <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-secondary">
                            <UserRound className="size-3.5 shrink-0" aria-hidden />
                            <span className="truncate" title={r.homeroom}>{r.homeroom}</span>
                          </span>
                        ) : (
                          <Badge tone="warning">{t("notAssigned")}</Badge>
                        )}
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
