import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { isReportKey, readReportParams, runReport } from "@/features/admin/reports/definitions";
import { can, getAccess } from "@/lib/auth/access";
import { toCsv } from "@/lib/export/csv";
import { todayIso } from "@/lib/i18n/format";
import { createClient } from "@/lib/supabase/server";

/** CSV export of an administrative report. Every export is written to the audit log. */
export async function GET(request: NextRequest) {
  const access = await getAccess();
  if (!access?.school || !can(access, "reports.view") || !can(access, "reports.export")) return new NextResponse(null, { status: 403 });
  const key = request.nextUrl.searchParams.get("report") ?? undefined;
  if (!isReportKey(key)) return new NextResponse(null, { status: 404 });
  const params = readReportParams(request.nextUrl.searchParams, todayIso(access.school.timezone));
  const result = await runReport(key, params);
  if (result.error || result.needs) return new NextResponse(null, { status: 400 });

  const t = await getTranslations("admin.reports.columns");
  const supabase = await createClient();
  await supabase.rpc("write_audit_log", {
    p_action: "export",
    p_entity_type: `report_${key}`,
    p_metadata: { rows: result.rows.length, from: params.from, to: params.to, class_id: params.classId, term_id: params.termId, year_id: params.yearId },
  });

  const csv = toCsv(result.rows, result.columns.map((c) => ({ header: t(c.label), value: (row: Record<string, string | number | null>) => row[c.key] ?? "" })));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="report-${key}-${params.to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
