import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { AdminNav } from "../admin-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { GraduationCap } from "lucide-react";

export default async function AdminClassesPage() {
  const admin = await requireAdmin();
  const t = await getTranslations();
  const supabase = await createServerClient();

  const { data: classesData } = await supabase
    .from("classes" as never)
    .select("id, name, grade_level, is_active, academic_year_id, homeroom_teacher_id, academic_years:academic_year_id(name), users:homeroom_teacher_id(first_name, last_name)" as never)
    .eq("school_id" as never, admin.schoolId)
    .order("grade_level" as never, { ascending: true })
    .order("name" as never, { ascending: true });

  const classes = (classesData ?? []) as Array<Record<string, unknown>>;

  return (
    <div>
      <AdminNav />
      <div className="space-y-6 animate-in">
        <h1 className="text-2xl font-bold text-neutral-900">{t("admin.classes")}</h1>

        {classes.length === 0 ? (
          <EmptyState
            icon={<GraduationCap className="h-16 w-16" />}
            title={t("admin.classes")}
            description={t("common.noData")}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map((cls) => {
              const year = cls.academic_years as Record<string, unknown> | null;
              const teacher = cls.users as Record<string, unknown> | null;
              return (
                <Card key={cls.id as string}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{cls.name as string}</CardTitle>
                      <Badge variant={cls.is_active ? "default" : "secondary"}>
                        {cls.is_active ? t("admin.moduleEnabled") : t("admin.moduleDisabled")}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 text-sm text-neutral-600">
                      <p>{t("admin.classes")}: {cls.grade_level as number}</p>
                      {year && <p>{year.name as string}</p>}
                      {teacher && (
                        <p>
                          {t("admin.homeroomTeacher")}: {teacher.first_name as string} {teacher.last_name as string}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
