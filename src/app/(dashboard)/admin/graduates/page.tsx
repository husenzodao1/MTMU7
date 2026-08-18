import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";
import { GraduatesList } from "./graduates-list";

async function getGraduates(schoolId: string) {
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("users" as never)
    .select("id, public_id, first_name, last_name, middle_name, email, avatar_url, graduation_year, years_in_school" as never)
    .eq("status" as never, "graduated")
    .order("graduation_year" as never, { ascending: false });

  const graduatesArr = (data ?? []) as Array<Record<string, unknown>>;

  const withClasses = await Promise.all(
    graduatesArr.map(async (g) => {
      const { data: lastEnrollment } = await supabase
        .from("student_enrollments" as never)
        .select("classes:class_id(name)" as never)
        .eq("student_id" as never, g.id as string)
        .order("created_at" as never, { ascending: false })
        .limit(1)
        .single();

      const enrollment = lastEnrollment as Record<string, unknown> | null;
      const cls = enrollment?.classes as Record<string, unknown> | null;

      return {
        id: g.id as string,
        publicId: g.public_id as string,
        firstName: g.first_name as string,
        lastName: g.last_name as string,
        middleName: (g.middle_name as string) ?? null,
        email: g.email as string,
        avatarUrl: (g.avatar_url as string) ?? null,
        graduationYear: (g.graduation_year as number) ?? null,
        yearsInSchool: (g.years_in_school as number) ?? null,
        lastClass: cls ? (cls.name as string) : null,
      };
    })
  );

  return withClasses;
}

export default async function GraduatesPage() {
  const admin = await requireAdmin();
  const t = await getTranslations("admin");
  const graduates = await getGraduates(admin.schoolId);

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">{t("graduates")}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t("graduatesList")}</p>
        </div>
        <GraduatesList graduates={graduates} />
      </div>
    </div>
  );
}
