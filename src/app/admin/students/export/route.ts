import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { can, getAccess } from "@/lib/auth/access";
import { toCsv } from "@/lib/export/csv";
import { ilikeAny } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

const STATUSES = ["active", "inactive", "transferred", "graduated", "archived"];
const GENDERS = ["male", "female"];

/** CSV export of the student register under the caller's RLS; every export is audited. */
export async function GET(request: NextRequest) {
  const access = await getAccess();
  if (!access?.school || !can(access, "students.view") || !can(access, "reports.export")) return new NextResponse(null, { status: 403 });
  const params = request.nextUrl.searchParams;
  const supabase = await createClient();
  const t = await getTranslations("admin.people");
  const ts = await getTranslations("common.status");

  let query = supabase
    .from("students")
    .select("student_number, last_name, first_name, middle_name, gender, date_of_birth, status, admission_date, enrollments(status, classes(name))")
    .eq("school_id", access.school.id)
    .eq("enrollments.status", "active")
    .order("last_name")
    .order("first_name")
    .limit(10000);
  const status = params.get("status");
  query = status && STATUSES.includes(status) ? query.eq("status", status) : query.neq("status", "archived");
  const gender = params.get("gender");
  if (gender && GENDERS.includes(gender)) query = query.eq("gender", gender);
  const classFilter = params.get("class");
  if (classFilter === "none") query = query.is("enrollments", null);
  else if (classFilter && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(classFilter)) {
    query = query.eq("enrollments.class_id", classFilter);
  }
  const search = ilikeAny(["last_name", "first_name", "middle_name", "student_number"], (params.get("q") ?? "").slice(0, 100));
  if (search) query = query.or(search);
  const { data, error } = await query;
  if (error) return new NextResponse(null, { status: 500 });

  await supabase.rpc("write_audit_log", {
    p_action: "export",
    p_entity_type: "students",
    p_metadata: { rows: data?.length ?? 0, status: status ?? null, gender: gender ?? null, class: classFilter ?? null, query: params.get("q") ? "filtered" : null },
  });

  type Row = NonNullable<typeof data>[number];
  const csv = toCsv<Row>(data ?? [], [
    { header: t("studentNumber"), value: (r) => r.student_number },
    { header: t("lastName"), value: (r) => r.last_name },
    { header: t("firstName"), value: (r) => r.first_name },
    { header: t("middleName"), value: (r) => r.middle_name },
    { header: t("gender"), value: (r) => r.gender },
    { header: t("dateOfBirth"), value: (r) => r.date_of_birth },
    { header: t("class"), value: (r) => (r.enrollments as unknown as Array<{ classes: { name: string } | null }>)[0]?.classes?.name ?? "" },
    { header: t("status"), value: (r) => ts(r.status) },
    { header: t("admissionDate"), value: (r) => r.admission_date },
  ]);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="students-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
