import { NextResponse } from "next/server";
import { IMPORT_CONFIG, isImportKind } from "@/features/admin/import/config";
import { canEnterAdmin, getAccess } from "@/lib/auth/access";
import { toCsv } from "@/lib/export/csv";

/** Empty CSV template with the canonical header row. */
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const access = await getAccess();
  if (!access || !canEnterAdmin(access)) return new NextResponse(null, { status: 403 });
  if (!isImportKind(kind)) return new NextResponse(null, { status: 404 });
  const columns = IMPORT_CONFIG[kind].columns.map((header) => ({ header, value: () => "" }));
  return new NextResponse(toCsv([], columns), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-template.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
