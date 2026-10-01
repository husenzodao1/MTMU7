import { NextResponse } from "next/server";
import { getAccess } from "@/lib/auth/access";
import { can } from "@/lib/auth/access";
import { EXPORT_KINDS, exportAccounts, type ExportKind } from "@/features/accounts/export";

export const runtime = "nodejs";

/** The register as an Excel workbook, of the kind asked for. */
export async function GET(request: Request) {
  const access = await getAccess();
  if (!access?.school) return new NextResponse(null, { status: 401 });
  if (!can(access, "users.view")) return new NextResponse(null, { status: 403 });
  const kind = new URL(request.url).searchParams.get("kind") ?? "all";
  if (!(EXPORT_KINDS as readonly string[]).includes(kind)) return new NextResponse(null, { status: 400 });
  return exportAccounts(kind as ExportKind, access.school.timezone, "accounts");
}
