import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { setModuleEnabledAction } from "@/features/admin/management/actions";
import { ConfirmAction } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { pickText, type Locale } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("modules") };
}

export default async function ModulesPage() {
  const access = await requirePermission("modules.manage");
  const t = await getTranslations("admin.modules");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const { data } = await supabase
    .from("school_modules")
    .select("module_id, is_enabled, modules(slug, name_tg, name_ru, name_en, description_tg, description_ru, category, is_core, sort_order)")
    .eq("school_id", access.school!.id);

  const rows = (data ?? [])
    .map((row) => ({ ...row, module: row.modules as unknown as { slug: string; name_tg: string; name_ru: string | null; name_en: string | null; description_tg: string | null; description_ru: string | null; category: string | null; is_core: boolean; sort_order: number } }))
    .filter((row) => row.module)
    .sort((a, b) => a.module.sort_order - b.module.sort_order);

  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />} title={t("title")} description={t("description")} />
      <Card>
        <CardBody className="p-0">
          <ul className="divide-y divide-line">
            {rows.map(({ module_id, is_enabled, module }) => {
              const name = pickText({ tg: module.name_tg, ru: module.name_ru, en: module.name_en }, locale);
              const description = pickText({ tg: module.description_tg, ru: module.description_ru, en: null }, locale);
              return (
                <li key={module_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{name}</span>
                      {module.is_core ? <Badge tone="brand">{t("core")}</Badge> : null}
                    </span>
                    {description ? <span className="block text-sm text-ink-muted">{description}</span> : null}
                  </span>
                  <span className="flex items-center gap-2">
                    {is_enabled ? <Badge tone="success">{t("enabled")}</Badge> : <Badge>{t("disabled")}</Badge>}
                    {!module.is_core ? (
                      <ConfirmAction
                        action={setModuleEnabledAction}
                        fields={{ moduleId: module_id, enabled: is_enabled ? "false" : "true" }}
                        title={is_enabled ? t("disableTitle", { name }) : t("enableTitle", { name })}
                        description={is_enabled ? t("disableDescription") : undefined}
                        confirmLabel={is_enabled ? t("disable") : t("enable")}
                        tone={is_enabled ? "danger" : "primary"}
                        trigger={<Button variant="secondary" size="sm">{is_enabled ? t("disable") : t("enable")}</Button>}
                      />
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
    </>
  );
}
