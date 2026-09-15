import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Download, FileBarChart } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { getClassOptions } from "@/features/admin/queries";
import { isReportKey, readReportParams, REPORT_KEYS, runReport } from "@/features/admin/reports/definitions";
import { Button, buttonClasses } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/fields";
import { Alert, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, formatNumber, formatPercent, todayIso } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("reports") };
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("reports.view");
  const t = await getTranslations("admin.reports");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const reportParam = firstValue(params.report);
  const report = isReportKey(reportParam) ? reportParam : null;
  const today = todayIso(access.school!.timezone);
  const p = readReportParams(params, today);
  const schoolId = access.school!.id;
  const supabase = await createClient();

  const [classes, { data: years }, { data: terms }] = await Promise.all([
    getClassOptions(schoolId),
    supabase.from("academic_years").select("id, name, is_current").eq("school_id", schoolId).order("start_date", { ascending: false }),
    supabase.from("academic_terms").select("id, name, academic_years!inner(is_current)").eq("school_id", schoolId).eq("academic_years.is_current", true).order("start_date"),
  ]);
  const result = report ? await runReport(report, p) : null;
  const exportQuery = new URLSearchParams({ report: report ?? "", from: p.from, to: p.to, ...(p.classId ? { class: p.classId } : {}), ...(p.termId ? { term: p.termId } : {}), ...(p.yearId ? { year: p.yearId } : {}) });

  const format = (value: string | number | null, kind?: string) => {
    if (value === null || value === undefined || value === "") return "—";
    if (kind === "number") return formatNumber(value, locale, 1);
    if (kind === "percent") return formatPercent(value, locale);
    if (kind === "date") return formatDate(String(value).slice(0, 10), locale);
    return String(value);
  };

  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />} title={t("title")} description={t("description")} />
      <nav aria-label={t("choose")} className="mb-5">
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {REPORT_KEYS.map((key) => (
            <li key={key}>
              <Link
                href={`/admin/reports?report=${key}`}
                aria-current={report === key ? "page" : undefined}
                className={cn("flex h-full flex-col rounded-lg border px-4 py-3 hover:border-brand-300", report === key ? "border-brand-600 bg-brand-50" : "border-line bg-surface")}
              >
                <span className="font-medium">{t(`kinds.${key}.name`)}</span>
                <span className="text-sm text-ink-muted">{t(`kinds.${key}.question`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {report && result ? (
        <Card>
          <CardHeader
            title={t(`kinds.${report}.name`)}
            actions={can(access, "reports.export") && result.rows.length > 0 ? (
              <a href={`/admin/reports/export?${exportQuery.toString()}`} className={buttonClasses("secondary", "sm")}>
                <Download aria-hidden />
                {tc("exportCsv")}
              </a>
            ) : null}
          />
          <CardBody className="space-y-4">
            <form method="get" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="report" value={report} />
              {report === "attendance" || report === "content" ? (
                <>
                  <TextField name="from" type="date" label={t("from")} defaultValue={p.from} max={today} />
                  <TextField name="to" type="date" label={t("to")} defaultValue={p.to} max={today} />
                </>
              ) : null}
              {report === "attendance" || report === "grades" ? (
                <SelectField name="class" label={t("class")} defaultValue={p.classId ?? ""} placeholder={report === "grades" ? t("chooseClass") : t("allClasses")} options={classes.map(({ value, label }) => ({ value, label }))} />
              ) : null}
              {report === "grades" ? (
                <SelectField name="term" label={t("term")} defaultValue={p.termId ?? ""} placeholder={t("allTerms")} options={(terms ?? []).map((x) => ({ value: x.id, label: x.name }))} />
              ) : null}
              {report === "enrollment" || report === "workload" ? (
                <SelectField name="year" label={t("year")} defaultValue={p.yearId ?? ""} placeholder={t("currentYear")} options={(years ?? []).filter((y) => !y.is_current).map((y) => ({ value: y.id, label: y.name }))} />
              ) : null}
              {report !== "library" ? <Button type="submit" variant="secondary">{t("run")}</Button> : null}
            </form>
            {result.error ? <Alert tone="danger">{t("error")}</Alert> : null}
            {result.needs ? (
              <EmptyState icon={<FileBarChart />} title={t(result.needs)} />
            ) : result.rows.length === 0 ? (
              <EmptyState icon={<FileBarChart />} title={t("empty")} />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t(`kinds.${report}.name`)}</caption>
                  <thead>
                    <tr className="border-b border-line bg-surface-muted/60 text-xs uppercase tracking-wide text-ink-muted">
                      {result.columns.map((c) => (
                        <th key={c.key} scope="col" className={cn("px-3 py-2", c.kind === "number" || c.kind === "percent" ? "text-end" : "text-start")}>{t(`columns.${c.label}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {result.rows.slice(0, 1000).map((row, index) => (
                      <tr key={index}>
                        {result.columns.map((c) => (
                          <td key={c.key} className={cn("px-3 py-2", c.kind === "number" || c.kind === "percent" ? "text-end tabular" : "text-start")}>{format(row[c.key] ?? null, c.kind)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result.rows.length > 1000 ? <p className="text-sm text-ink-muted">{t("truncated", { shown: 1000, total: result.rows.length })}</p> : null}
          </CardBody>
        </Card>
      ) : (
        <Card as="div"><EmptyState icon={<FileBarChart />} title={t("pick")} /></Card>
      )}
    </>
  );
}
