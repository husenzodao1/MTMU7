import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { getClassOptions } from "@/features/admin/queries";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { TextField } from "@/components/ui/fields";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, todayIso } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("attendance") };
}

export default async function AdminAttendancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("attendance.update");
  const t = await getTranslations("admin.attendance");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const schoolId = access.school!.id;
  const today = todayIso(access.school!.timezone);
  const dateRaw = firstValue(params.date);
  const date = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) && dateRaw <= today ? dateRaw : today;
  const supabase = await createClient();

  const [classes, { data: records }, { data: enrollments }] = await Promise.all([
    getClassOptions(schoolId),
    supabase.from("attendance_records").select("class_id, class_subject_id, status").eq("school_id", schoolId).eq("attendance_date", date).limit(20000),
    supabase.from("enrollments").select("class_id").eq("school_id", schoolId).eq("status", "active").limit(20000),
  ]);

  const summary = new Map<string, { daily: number; lessons: number; absent: number; late: number }>();
  for (const r of records ?? []) {
    const entry = summary.get(r.class_id) ?? { daily: 0, lessons: 0, absent: 0, late: 0 };
    if (r.class_subject_id) entry.lessons += 1;
    else entry.daily += 1;
    if (r.status === "absent") entry.absent += 1;
    if (r.status === "late") entry.late += 1;
    summary.set(r.class_id, entry);
  }
  const sizes = new Map<string, number>();
  for (const e of enrollments ?? []) sizes.set(e.class_id, (sizes.get(e.class_id) ?? 0) + 1);

  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />} title={t("title")} description={t("description")} />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <TextField name="date" type="date" label={t("date")} defaultValue={date} max={today} />
        <Button type="submit" variant="secondary">{tc("open")}</Button>
        <Link href="/admin/reports?report=attendance" className={buttonClasses("ghost")}>{t("report")}</Link>
      </form>
      <Card>
        <CardHeader title={t("registersOn", { date: formatDate(date, locale) })} description={t("registersHint")} />
        <CardBody className="p-0">
          {classes.length === 0 ? (
            <EmptyState title={t("noClasses")} />
          ) : (
            <ul className="divide-y divide-line">
              {classes.map((c) => {
                const s = summary.get(c.value);
                const size = sizes.get(c.value) ?? 0;
                const dailyDone = (s?.daily ?? 0) >= size && size > 0;
                return (
                  <li key={c.value} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <span>
                      <span className="font-semibold">{c.label}</span>
                      <span className="block text-sm text-ink-muted">{t("classSummary", { students: size, lessons: s?.lessons ?? 0, absent: s?.absent ?? 0, late: s?.late ?? 0 })}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {size === 0 ? <Badge>{t("noStudents")}</Badge> : dailyDone ? <Badge tone="success">{t("dailyDone")}</Badge> : <Badge tone="warning">{t("dailyMissing")}</Badge>}
                      <Link href={`/teach/attendance?class=${c.value}&date=${date}`} className={buttonClasses("secondary", "sm")}>{t("openRegister")}</Link>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
