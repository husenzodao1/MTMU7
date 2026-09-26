import { NextResponse } from "next/server";
import { getAccess } from "@/lib/auth/access";
import { exportAccounts } from "@/features/accounts/export";

export const runtime = "nodejs";

/** The homeroom teacher's class as a workbook: the pupils, and only theirs. */
export async function GET() {
  const access = await getAccess();
  if (!access?.school) return new NextResponse(null, { status: 401 });
  return exportAccounts("students", access.school.timezone, "class");
}
