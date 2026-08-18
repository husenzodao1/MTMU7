import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../../admin-nav";
import { UserDetail } from "./user-detail";
import { notFound } from "next/navigation";

async function getUserDetail(userId: string, adminSchoolId: string) {
  const supabase = await createServerClient();

  const { data: user } = await supabase
    .from("users" as never)
    .select(
      "id, public_id, first_name, last_name, middle_name, email, phone, is_active, avatar_url, status, created_at, graduation_year, graduation_date, years_in_school" as never
    )
    .eq("id" as never, userId)
    .single();

  if (!user) return null;

  const row = user as Record<string, unknown>;

  const { data: userRoles } = await supabase
    .from("user_roles" as never)
    .select("roles:role_id(id, slug, name_tg, is_system)" as never)
    .eq("user_id" as never, userId);

  const { data: allRoles } = await supabase
    .from("roles" as never)
    .select("id, slug, name_tg, level" as never)
    .eq("school_id" as never, adminSchoolId)
    .eq("is_active" as never, true)
    .order("level" as never, { ascending: true });

  const { data: classAssignment } = await supabase
    .from("class_students" as never)
    .select("classes:class_id(id, name, academic_year_id, academic_years:academic_year_id(name))" as never)
    .eq("student_id" as never, userId)
    .limit(1)
    .single();

  const classRow = classAssignment as Record<string, unknown> | null;
  let currentClass: { id: string; name: string; academicYear: string } | null = null;
  if (classRow) {
    const cls = classRow.classes as Record<string, unknown>;
    const ay = cls.academic_years as Record<string, unknown> | null;
    currentClass = {
      id: cls.id as string,
      name: cls.name as string,
      academicYear: ay ? (ay.name as string) : "",
    };
  }

  const { data: regRequest } = await supabase
    .from("registration_requests" as never)
    .select("reviewed_at, status, rejection_reason" as never)
    .eq("auth_user_id" as never, userId)
    .order("created_at" as never, { ascending: false })
    .limit(1)
    .single();
  const regReq = regRequest as Record<string, unknown> | null;

  const { data: firstEnrollment } = await supabase
    .from("student_enrollments" as never)
    .select("enrolled_at" as never)
    .eq("student_id" as never, userId)
    .order("enrolled_at" as never, { ascending: true })
    .limit(1)
    .single();
  const firstEnr = firstEnrollment as Record<string, unknown> | null;

  const { data: enrollments } = await supabase
    .from("student_enrollments" as never)
    .select("id, enrolled_at, classes:class_id(name), academic_years:academic_year_id(name), enrollers:enrolled_by(first_name, last_name)" as never)
    .eq("student_id" as never, userId)
    .order("enrolled_at" as never, { ascending: false });

  const { data: statusHistory } = await supabase
    .from("user_status_history" as never)
    .select("id, action, old_value, new_value, notes, created_at, performers:performed_by(first_name, last_name)" as never)
    .eq("user_id" as never, userId)
    .order("created_at" as never, { ascending: false });

  const { data: availableClasses } = await supabase
    .from("classes" as never)
    .select("id, name, grade_level" as never)
    .eq("school_id" as never, adminSchoolId)
    .eq("is_active" as never, true)
    .order("grade_level" as never, { ascending: true })
    .order("name" as never, { ascending: true });

  const { data: availableYears } = await supabase
    .from("academic_years" as never)
    .select("id, name" as never)
    .eq("school_id" as never, adminSchoolId)
    .order("start_date" as never, { ascending: false });

  return {
    user: {
      id: row.id as string,
      publicId: row.public_id as string,
      firstName: row.first_name as string,
      lastName: row.last_name as string,
      middleName: (row.middle_name as string) ?? null,
      email: row.email as string,
      phone: (row.phone as string) ?? null,
      isActive: row.is_active as boolean,
      avatarUrl: (row.avatar_url as string) ?? null,
      status: (row.status as string) ?? "active",
      createdAt: row.created_at as string,
      graduationYear: (row.graduation_year as number) ?? null,
      graduationDate: (row.graduation_date as string) ?? null,
      yearsInSchool: (row.years_in_school as number) ?? null,
      assignedRoles: ((userRoles ?? []) as Array<Record<string, unknown>>).map((ur) => {
        const r = ur.roles as Record<string, unknown>;
        return {
          id: r.id as string,
          slug: r.slug as string,
          nameTg: r.name_tg as string,
          isSystem: r.is_system as boolean,
        };
      }),
      currentClass,
      approvalDate: (regReq?.reviewed_at as string) ?? null,
      enrollmentDate: (firstEnr?.enrolled_at as string) ?? null,
    },
    availableRoles: ((allRoles ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      slug: r.slug as string,
      nameTg: r.name_tg as string,
      level: r.level as number,
    })),
    availableClasses: ((availableClasses ?? []) as Array<Record<string, unknown>>).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      gradeLevel: c.grade_level as number,
    })),
    availableYears: ((availableYears ?? []) as Array<Record<string, unknown>>).map((y) => ({
      id: y.id as string,
      name: y.name as string,
    })),
    enrollmentHistory: ((enrollments ?? []) as Array<Record<string, unknown>>).map((e) => {
      const cls = e.classes as Record<string, unknown> | null;
      const yr = e.academic_years as Record<string, unknown> | null;
      const enroller = e.enrollers as Record<string, unknown> | null;
      return {
        id: e.id as string,
        enrolledAt: e.enrolled_at as string,
        className: cls ? (cls.name as string) : "",
        academicYear: yr ? (yr.name as string) : "",
        enrolledBy: enroller ? `${enroller.first_name} ${enroller.last_name}` : "",
      };
    }),
    statusHistory: ((statusHistory ?? []) as Array<Record<string, unknown>>).map((h) => {
      const performer = h.performers as Record<string, unknown> | null;
      return {
        id: h.id as string,
        action: h.action as string,
        oldValue: (h.old_value as string) ?? null,
        newValue: (h.new_value as string) ?? null,
        notes: (h.notes as string) ?? null,
        createdAt: h.created_at as string,
        performedBy: performer ? `${performer.first_name} ${performer.last_name}` : "",
      };
    }),
  };
}

async function checkIsSuperAdmin(userId: string) {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("users" as never)
    .select("is_super_admin" as never)
    .eq("id" as never, userId)
    .single();
  const row = data as Record<string, unknown> | null;
  return row?.is_super_admin === true;
}

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const admin = await requireAdmin();
  const { userId } = await params;
  const [data, isSuperAdmin] = await Promise.all([
    getUserDetail(userId, admin.schoolId),
    checkIsSuperAdmin(admin.id),
  ]);

  if (!data) notFound();

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <UserDetail
          user={data.user}
          availableRoles={data.availableRoles}
          availableClasses={data.availableClasses}
          availableYears={data.availableYears}
          enrollmentHistory={data.enrollmentHistory}
          statusHistory={data.statusHistory}
          isSuperAdmin={isSuperAdmin}
        />
      </div>
    </div>
  );
}
