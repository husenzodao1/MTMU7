import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { AdminNav } from "../admin-nav";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { BookMarked } from "lucide-react";

export default async function AdminSubjectsPage() {
  const admin = await requireAdmin();
  const t = await getTranslations();
  const supabase = await createServerClient();

  const { data: subjectsData } = await supabase
    .from("subjects" as never)
    .select("id, name_tg, name_ru, code, is_active" as never)
    .eq("school_id" as never, admin.schoolId)
    .order("name_tg" as never, { ascending: true });

  const subjects = (subjectsData ?? []) as Array<Record<string, unknown>>;

  return (
    <div>
      <AdminNav />
      <div className="space-y-6 animate-in">
        <h1 className="text-2xl font-bold text-neutral-900">{t("admin.subjects")}</h1>

        {subjects.length === 0 ? (
          <EmptyState
            icon={<BookMarked className="h-16 w-16" />}
            title={t("admin.subjects")}
            description={t("common.noData")}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map((subj) => (
              <Card key={subj.id as string}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium text-neutral-900">{subj.name_tg as string}</p>
                    {(subj.name_ru as string | null) && (
                      <p className="text-sm text-neutral-500">{subj.name_ru as string}</p>
                    )}
                    {(subj.code as string | null) && (
                      <p className="text-xs text-neutral-400">{subj.code as string}</p>
                    )}
                  </div>
                  <Badge variant={subj.is_active ? "default" : "secondary"}>
                    {subj.is_active ? t("admin.moduleEnabled") : t("admin.moduleDisabled")}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
