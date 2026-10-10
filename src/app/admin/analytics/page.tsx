import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { Alert, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { formatMonth, formatShortDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("analytics") };
}

const num = z.union([z.number(), z.string()]).transform(Number);
const analyticsSchema = z.object({
  attendance_weekly: z.array(z.object({ week: z.string(), rate: num.nullable(), records: num })),
  enrollment_by_year: z.array(z.object({ year: z.string(), students: num })),
  grade_distribution: z.array(z.object({ band: num, count: num })),
  subject_averages: z.array(z.object({ subject: z.string(), average_percent: num.nullable(), grades: num })),
  registrations_monthly: z.array(z.object({ month: z.string(), count: num })),
});

/**
 * A labelled horizontal bar list with a printed value and a light scale, so it
 * is readable without colour, hover or a charting library.
 */
function BarList({ items, max, unit, emptyLabel }: { items: Array<{ label: string; value: number; note?: string }>; max: number; unit?: string; emptyLabel: string }) {
  if (items.length === 0) return <p className="text-sm text-ink-muted">{emptyLabel}</p>;
  const ticks = [0, max / 2, max];
  return (
    <div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate text-ink-secondary" title={item.label}>{item.label}</span>
            <span className="relative h-2.5 rounded-full bg-surface-muted" aria-hidden>
              <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong/60" />
              <span className="block h-full rounded-full bg-brand-solid" style={{ width: `${max > 0 ? Math.max(2, (item.value / max) * 100) : 0}%` }} />
            </span>
            <span className="tabular font-medium">
              {item.value}
              {unit}
              {item.note ? <span className="ms-1 font-normal text-ink-muted">{item.note}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 grid grid-cols-[minmax(0,9rem)_1fr_auto] gap-3" aria-hidden>
        <span />
        <span className="flex justify-between text-xs tabular text-ink-muted">
          {ticks.map((tick, index) => (
            <span key={index}>{Math.round(tick)}{unit}</span>
          ))}
        </span>
        <span />
      </div>
    </div>
  );
}

export default async function AnalyticsPage() {
  await requirePermission("analytics.view");
  const t = await getTranslations("admin.analytics");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("analytics_overview");
  const parsed = analyticsSchema.safeParse(data);

  if (error || !parsed.success) {
    return (
      <>
        <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />} title={t("title")} />
        <Alert tone="danger">{t("loadError")}</Alert>
      </>
    );
  }
  const a = parsed.data;
  const bands = ["0–20%", "20–40%", "40–60%", "60–80%", "80–100%"];
  // width_bucket returns 6 for values above the upper bound; count them in the top band.
  const distribution = bands.map((label, index) => ({
    label,
    value: a.grade_distribution.filter((d) => d.band === index + 1 || (index === 4 && d.band > 5)).reduce((sum, d) => sum + d.count, 0),
  }));

  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />} title={t("title")} description={t("description")} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("attendance.title")} description={t("attendance.question")} />
          <CardBody>
            <BarList
              items={a.attendance_weekly.map((w) => ({ label: t("weekOf", { date: formatShortDate(w.week, locale) }), value: Math.round(Number(w.rate ?? 0) * 10) / 10, note: t("records", { count: w.records }) }))}
              max={100}
              unit="%"
              emptyLabel={t("noData")}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("subjects.title")} description={t("subjects.question")} />
          <CardBody>
            <BarList
              items={a.subject_averages.map((s) => ({ label: s.subject, value: Math.round(Number(s.average_percent ?? 0) * 10) / 10, note: t("grades", { count: s.grades }) }))}
              max={100}
              unit="%"
              emptyLabel={t("noData")}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("distribution.title")} description={t("distribution.question")} />
          <CardBody>
            <BarList
              items={distribution.every((d) => d.value === 0) ? [] : distribution}
              max={Math.max(0, ...distribution.map((d) => d.value))}
              emptyLabel={t("noData")}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("enrollment.title")} description={t("enrollment.question")} />
          <CardBody>
            <BarList items={a.enrollment_by_year.map((y) => ({ label: y.year, value: y.students }))} max={Math.max(0, ...a.enrollment_by_year.map((y) => y.students))} emptyLabel={t("noData")} />
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={t("registrations.title")} description={t("registrations.question")} />
          <CardBody>
            <BarList
              items={a.registrations_monthly.map((m) => ({ label: formatMonth(m.month, locale), value: m.count }))}
              max={Math.max(0, ...a.registrations_monthly.map((m) => m.count))}
              emptyLabel={t("noData")}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
