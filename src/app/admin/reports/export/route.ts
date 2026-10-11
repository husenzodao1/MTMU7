import { NextResponse, type NextRequest } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { reportPdf } from "@/features/admin/reports/report-pdf";
import { isReportKey, readReportParams, runReport } from "@/features/admin/reports/definitions";
import { can, getAccess } from "@/lib/auth/access";
import { toCsv } from "@/lib/export/csv";
import { formatShortDate, todayIso } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { pdfResponse } from "@/lib/pdf/kit";
import { createClient } from "@/lib/supabase/server";

/** CSV (or, with format=pdf, PDF) export of an administrative report. Every export is written to the audit log. */
export async function GET(request: NextRequest) {
  const access = await getAccess();
  if (!access?.school || !can(access, "reports.view") || !can(access, "reports.export")) return new NextResponse(null, { status: 403 });
  const key = request.nextUrl.searchParams.get("report") ?? undefined;
  if (!isReportKey(key)) return new NextResponse(null, { status: 404 });
  const params = readReportParams(request.nextUrl.searchParams, todayIso(access.school.timezone));
  const result = await runReport(key, params);
  if (result.error || result.needs) return new NextResponse(null, { status: 400 });

  const t = await getTranslations("admin.reports.columns");
  const tk = await getTranslations("admin.reports.kinds");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  await supabase.rpc("write_audit_log", {
    p_action: "export",
    p_entity_type: `report_${key}`,
    p_metadata: { rows: result.rows.length, from: params.from, to: params.to, class_id: params.classId, term_id: params.termId, year_id: params.yearId },
  });

  if (request.nextUrl.searchParams.get("format") === "pdf") {
    const pdf = await reportPdf({
      title: tk(`${key}.name`),
      period: `${formatShortDate(params.from, locale)} — ${formatShortDate(params.to, locale)}`,
      school: access.school.fullName || access.school.shortName,
      columns: result.columns.map((c) => ({ label: t(c.label), numeric: result.rows.some((row) => typeof row[c.key] === "number") })),
      rows: result.rows.map((row) => result.columns.map((c) => row[c.key] ?? "")),
    });
    return pdfResponse(pdf, `report-${key}-${params.to}.pdf`);
  }

  const csv = toCsv(result.rows, result.columns.map((c) => ({ header: t(c.label), value: (row: Record<string, string | number | null>) => row[c.key] ?? "" })));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="report-${key}-${params.to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
