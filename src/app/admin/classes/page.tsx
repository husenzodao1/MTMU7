import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus, School } from "lucide-react";
import { ClassFields } from "@/features/admin/academic/class-fields";
import { saveClassAction } from "@/features/admin/academic/structure-actions";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { fullName, getStaffOptions } from "@/features/admin/queries";
import { FormDialog } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filters";
import { Alert, EmptyState, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("classes") };
}

export default async function AdminClassesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("classes.view", "classes.create", "classes.update", "enrollments.manage");
  const t = await getTranslations("admin.classes");
  const tc = await getTranslations("common");
  const params = await searchParams;
  const schoolId = access.school!.id;
  const supabase = await createClient();

  const { data: years } = await supabase.from("academic_years").select("id, name, is_current").eq("school_id", schoolId).order("start_date", { ascending: false });
  const yearParam = firstValue(params.year);
  const year = (years ?? []).find((y) => y.id === yearParam) ?? (years ?? []).find((y) => y.is_current) ?? years?.[0];
  const showArchived = firstValue(params.archived) === "1";

  const [{ data: classes }, staff, { data: rooms }] = await Promise.all([
    year
      ? (() => {
          let query = supabase
            .from("classes")
            .select("id, name, grade_level, shift, capacity, is_active, homeroom_staff_id, staff:homeroom_staff_id(first_name, last_name, middle_name), enrollments(status), class_subjects(id, teacher_id, is_active)")
            .eq("school_id", schoolId)
            .eq("academic_year_id", year.id)
            .order("grade_level")
            .order("name");
          if (!showArchived) query = query.eq("is_active", true);
          return query;
        })()
      : Promise.resolve({ data: [] }),
    getStaffOptions(schoolId),
    supabase.from("rooms").select("id, name").eq("school_id", schoolId).eq("is_active", true).order("name"),
  ]);

  const rows = (classes ?? []).map((c) => {
    const enrollments = (c.enrollments ?? []) as Array<{ status: string }>;
    const subjects = ((c.class_subjects ?? []) as Array<{ teacher_id: string | null; is_active: boolean }>).filter((s) => s.is_active);
    return {
      ...c,
      homeroom: c.staff ? fullName(c.staff as unknown as { first_name: string; last_name: string; middle_name: string | null }) : null,
      students: enrollments.filter((e) => e.status === "active").length,
      subjects: subjects.length,
      unassigned: subjects.filter((s) => !s.teacher_id).length,
    };
  });

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />}
        title={t("title")}
        description={year ? t("descriptionYear", { year: year.name }) : t("description")}
        actions={year && can(access, "classes.create") ? (
          <>
            {/* Classes are not imported on their own any more: the register
                workbook names each pupil's class, and the import makes the ones
                the school has not made yet. One way to do it, not two. */}
            <FormDialog action={saveClassAction} trigger={<Button><Plus aria-hidden />{t("new")}</Button>} title={t("new")} description={t("newHint", { year: year.name })} submitLabel={tc("create")} size="lg">
              <ClassFields academicYearId={year.id} staff={staff.map(({ value, label }) => ({ value, label }))} rooms={(rooms ?? []).map((r) => ({ value: r.id, label: r.name }))} />
            </FormDialog>
          </>
        ) : null}
      />
      {!year ? (
        <Alert tone="warning">{t("noYear")} <Link href="/admin/academic-years" className="font-medium underline">{t("openYears")}</Link></Alert>
      ) : (
        <>
          <FilterBar
            filters={[
              { name: "year", label: t("year"), emptyLabel: (years ?? []).find((y) => y.is_current)?.name ?? t("year"), options: (years ?? []).filter((y) => !y.is_current).map((y) => ({ value: y.id, label: y.name })) },
              { name: "archived", label: t("show"), emptyLabel: t("activeOnly"), options: [{ value: "1", label: t("includeArchived") }] },
            ]}
          />
          <DataTable
            caption={t("title")}
            rows={rows}
            rowKey={(r) => r.id}
        rowHref={(r) => `/admin/classes/${r.id}`}
            empty={<EmptyState icon={<School />} title={t("empty")} description={t("emptyHint")} />}
            columns={[
              {
                key: "name",
                header: t("name"),
                primary: true,
                cell: (r) => (
                  <span className="flex items-center gap-2">
                    <Link href={`/admin/classes/${r.id}`} className="font-semibold hover:text-brand-text hover:underline">{r.name}</Link>
                    {!r.is_active ? <Badge>{tc("status.archived")}</Badge> : null}
                  </span>
                ),
              },
              { key: "grade", header: t("gradeLevel"), cell: (r) => <span className="tabular">{r.grade_level}</span> },
              { key: "students", header: t("students"), cell: (r) => <span className="tabular">{r.students}{r.capacity ? ` / ${r.capacity}` : ""}</span> },
              { key: "homeroom", header: t("homeroom"), cell: (r) => r.homeroom ?? <Badge tone="warning">{t("notAssigned")}</Badge> },
              {
                key: "subjects",
                header: t("subjects"),
                hideOnMobile: true,
                cell: (r) => (
                  <span className="flex items-center gap-2 tabular">
                    {r.subjects}
                    {r.unassigned > 0 ? <Badge tone="warning">{t("withoutTeacher", { count: r.unassigned })}</Badge> : null}
                  </span>
                ),
              },
              { key: "shift", header: t("shift"), hideOnMobile: true, cell: (r) => t("shiftValue", { shift: r.shift }) },
            ]}
          />
        </>
      )}
    </>
  );
}
