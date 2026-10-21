import type { NextRequest } from "next/server";
import { reportCardsPdf } from "@/features/academic/report-cards";
import { resolveStudentContext } from "@/features/academic/student-context";
import { myHomeroomClasses } from "@/features/accounts/queries";
import { canAny, getAccess, hasModule } from "@/lib/auth/access";
import { pdfResponse } from "@/lib/pdf/kit";
import type { SearchParams } from "@/lib/list-params";

export const runtime = "nodejs";

/**
 * Report cards as a PDF.
 *
 *   /report-cards                 the signed-in pupil's own, or a parent's child
 *   /report-cards?child=…&year=…  (the same choices the grades page offers)
 *   /report-cards?class=…         every pupil of a class, for its class teacher
 *                                 and for the office
 *
 * Marks are read as the caller, so nobody can print more than they could see.
 */
export async function GET(request: NextRequest) {
  const access = await getAccess();
  if (!access?.school) return new Response(null, { status: 401 });
  if (!hasModule(access, "grades")) return new Response(null, { status: 404 });
  const school = access.school.fullName || access.school.shortName;
  const classId = request.nextUrl.searchParams.get("class");

  if (classId) {
    const homeroom = (await myHomeroomClasses(access)).some((c) => c.value === classId);
    if (!homeroom && !canAny(access, ["classes.view", "grades.approve", "reports.view"])) return new Response(null, { status: 403 });
    const result = await reportCardsPdf({ classId, school, timezone: access.school.timezone });
    return result ? pdfResponse(result.buffer, result.filename) : new Response(null, { status: 404 });
  }

  const params: SearchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const context = await resolveStudentContext(access, params);
  if (!context?.classId) return new Response(null, { status: 404 });
  const result = await reportCardsPdf({ classId: context.classId, studentIds: [context.studentId], school, timezone: access.school.timezone });
  return result ? pdfResponse(result.buffer, result.filename) : new Response(null, { status: 404 });
}
