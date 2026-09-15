import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Plus, ShieldCheck } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { saveRoleAction } from "@/features/admin/management/actions";
import { FormDialog } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { TextAreaField, TextField } from "@/components/ui/fields";
import { EmptyState, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { pickName, type Locale } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("roles") };
}

export default async function RolesPage() {
  const access = await requirePermission("roles.view");
  const t = await getTranslations("admin.roles");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const { data: roles } = await supabase
    .from("roles")
    .select("id, slug, name_tg, name_ru, name_en, level, is_system, is_active, description, role_permissions(permission_id), user_roles(user_id)")
    .eq("school_id", access.school!.id)
    .order("level")
    .order("slug");

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />}
        title={t("title")}
        description={t("description")}
        actions={can(access, "roles.manage") ? (
          <FormDialog action={saveRoleAction} trigger={<Button><Plus aria-hidden />{t("new")}</Button>} title={t("new")} description={t("newHint")} submitLabel={tc("create")} size="md">
            <TextField name="slug" label={t("slug")} hint={t("slugHint")} required maxLength={40} />
            <TextField name="nameTg" label={t("nameTg")} required maxLength={100} />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField name="nameRu" label={t("nameRu")} maxLength={100} />
              <TextField name="nameEn" label={t("nameEn")} maxLength={100} />
            </div>
            <TextField name="level" type="number" min={2} max={9} defaultValue={5} label={t("level")} hint={t("levelHint")} />
            <TextAreaField name="description" label={t("descriptionField")} rows={2} maxLength={500} />
          </FormDialog>
        ) : null}
      />
      <DataTable
        caption={t("title")}
        rows={roles ?? []}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={<ShieldCheck />} title={t("empty")} />}
        columns={[
          {
            key: "name",
            header: t("role"),
            primary: true,
            cell: (r) => (
              <div>
                <Link href={`/admin/roles/${r.id}`} className="font-medium hover:text-brand-700 hover:underline">{pickName(r, locale)}</Link>
                <p className="font-mono text-xs text-ink-muted">{r.slug}</p>
              </div>
            ),
          },
          { key: "type", header: t("type"), cell: (r) => (r.is_system ? <Badge tone="brand">{t("system")}</Badge> : <Badge>{t("custom")}</Badge>) },
          { key: "permissions", header: t("permissions"), cell: (r) => <span className="tabular">{r.slug === "admin" && r.is_system ? t("all") : ((r.role_permissions ?? []) as unknown[]).length}</span> },
          { key: "members", header: t("members"), cell: (r) => <span className="tabular">{((r.user_roles ?? []) as unknown[]).length}</span> },
          { key: "status", header: t("status"), hideOnMobile: true, cell: (r) => (r.is_active ? <Badge tone="success">{tc("status.active")}</Badge> : <Badge>{tc("status.inactive")}</Badge>) },
        ]}
        actions={(r) => <Link href={`/admin/roles/${r.id}`} className={buttonClasses("ghost", "sm")}>{t("open")}</Link>}
      />
    </>
  );
}
