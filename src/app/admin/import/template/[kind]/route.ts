import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { canEnterAdmin, getAccess } from "@/lib/auth/access";
import { toCsv } from "@/lib/export/csv";
import { buildWorkbook } from "@/lib/export/xlsx";
import { createClient } from "@/lib/supabase/server";
import { IMPORT_CONFIG, isImportKind } from "@/features/admin/import/config";
import { isPeopleKind, PEOPLE_TEMPLATES, TIMETABLE_TEMPLATE, type SheetSpec } from "@/features/admin/import/templates";
import { isSampleKind, sampleRows, SAMPLE_NOTICE } from "@/features/admin/import/samples";

export const runtime = "nodejs";

/**
 * The empty workbook the school office fills in.
 *
 * For people it is a real .xlsx with an instruction page, a frozen heading row
 * and the two grey columns the portal fills in itself. The pupil sheet arrives
 * with the school's existing class names already in the Синф column, in order,
 * so the office types names underneath them rather than inventing a second
 * spelling of 5А.
 *
 * The older CSV kinds are still served, unchanged, for the imports that have
 * not moved across yet.
 */
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  // ?sample=1 asks for the same workbook filled in, which is a different thing
  // from a blank one and is never confused with it: it carries its own front
  // page saying so, and its file name says so too.
  const wantsSample = new URL(request.url).searchParams.get("sample") === "1";
  const access = await getAccess();
  if (!access || !canEnterAdmin(access)) return new NextResponse(null, { status: 403 });

  const template: SheetSpec | null = isPeopleKind(kind) ? PEOPLE_TEMPLATES[kind] : kind === "timetable" ? TIMETABLE_TEMPLATE : null;
  if (template) {
    const t = await getTranslations("admin.import.workbook");
    const columns = template.columns.map((column) => ({
      header: column.required ? `${column.header}*` : column.header,
      width: column.width,
      issued: column.issued,
    }));

    let rows: Array<Array<string | null>> = [];
    if (wantsSample && isSampleKind(kind)) {
      rows = sampleRows(kind);
    } else if (kind === "students" && access.school) {
      const supabase = await createClient();
      const { data: classes } = await supabase
        .from("classes")
        .select("name, grade_level")
        .eq("school_id", access.school.id)
        .eq("is_active", true)
        .order("grade_level")
        .order("name");
      // One prompt row per class that already exists: the office copies it down
      // for every pupil in that class instead of retyping the name.
      rows = (classes ?? []).map((row) => columns.map((_, index) => (index === 0 ? row.name : null)));
    }

    const front = wantsSample
      ? { name: t("sampleSheet"), title: t("sampleTitle", { sheet: template.title }), lines: SAMPLE_NOTICE }
      : { name: t("instructionsSheet"), title: template.title, lines: [...template.instructions, "", t("requiredMark")] };

    const file = await buildWorkbook(
      wantsSample
        ? [front, { name: t("instructionsSheet"), title: template.title, lines: [...template.instructions, "", t("requiredMark")] }]
        : [front],
      [{ name: template.sheet, columns, rows }]
    );

    const name = wantsSample ? `${template.sheet} — ${t("sampleSuffix")}` : template.sheet;
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}.xlsx`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (!isImportKind(kind)) return new NextResponse(null, { status: 404 });
  const csvColumns = IMPORT_CONFIG[kind].columns.map((header) => ({ header, value: () => "" }));
  return new NextResponse(toCsv([], csvColumns), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-template.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
