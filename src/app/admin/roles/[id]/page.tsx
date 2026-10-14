import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { saveRoleAction, setRolePermissionsAction } from "@/features/admin/management/actions";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { TextAreaField, TextField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form-controls";
import { Alert, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { isPermission } from "@/lib/auth/permissions";
import { pickName, type Locale } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { robots: { index: false } };

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("roles.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await getTranslations("admin.roles");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();

  const [{ data: role }, { data: permissions }] = await Promise.all([
    supabase
      .from("roles")
      .select("id, school_id, slug, name_tg, name_ru, name_en, level, is_system, is_active, description, role_permissions(permissions(slug))")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("permissions").select("slug, module, name_tg, name_ru, name_en, is_platform").eq("is_platform", false).order("module").order("slug"),
  ]);
  if (!role || role.school_id !== access.school!.id) notFound();

  const granted = new Set(
    ((role.role_permissions ?? []) as unknown as Array<{ permissions: { slug: string } | null }>).map((rp) => rp.permissions?.slug).filter(Boolean)
  );
  const isAdminRole = role.is_system && role.slug === "admin";
  const manage = can(access, "roles.manage");
  const groups = new Map<string, NonNullable<typeof permissions>>();
  for (const p of permissions ?? []) {
    if (!groups.has(p.module)) groups.set(p.module, []);
    groups.get(p.module)!.push(p);
  }

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/roles" }, { label: pickName(role, locale) }]} />}
        title={pickName(role, locale)}
        description={role.description ?? undefined}
        meta={
          <>
            <Badge tone={role.is_system ? "brand" : "neutral"}>{role.is_system ? t("system") : t("custom")}</Badge>
            <span className="font-mono text-xs text-ink-muted">{role.slug}</span>
          </>
        }
      />
      {isAdminRole ? <Alert tone="info" className="mb-4">{t("adminRoleHint")}</Alert> : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,22rem)_1fr]">
        <Card>
          <CardHeader title={t("details")} />
          <CardBody>
            <ActionForm action={saveRoleAction} className="space-y-3">
              <input type="hidden" name="id" value={role.id} />
              <fieldset disabled={!manage} className="space-y-3">
                <TextField name="nameTg" label={t("nameTg")} defaultValue={role.name_tg} required maxLength={100} />
                <TextField name="nameRu" label={t("nameRu")} defaultValue={role.name_ru ?? ""} maxLength={100} />
                <TextField name="nameEn" label={t("nameEn")} defaultValue={role.name_en ?? ""} maxLength={100} />
                <TextAreaField name="description" label={t("descriptionField")} defaultValue={role.description ?? ""} rows={2} maxLength={500} />
                {!role.is_system ? (
                  <>
                    <TextField name="level" type="number" min={2} max={9} label={t("level")} defaultValue={role.level} />
                    <Checkbox name="isActive" defaultChecked={role.is_active} label={t("active")} />
                  </>
                ) : null}
              </fieldset>
              {manage ? <SubmitButton variant="secondary">{tc("saveChanges")}</SubmitButton> : null}
            </ActionForm>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("permissions")} description={t("matrixHint")} />
          <CardBody>
            <ActionForm action={setRolePermissionsAction} className="space-y-5">
              <input type="hidden" name="roleId" value={role.id} />
              {[...groups.entries()].map(([module, items]) => (
                <fieldset key={module} className="rounded-lg border border-line p-3">
                  <legend className="px-1 text-sm font-semibold capitalize">{t.has(`modules.${module}`) ? t(`modules.${module}`) : module}</legend>
                  <div className="grid gap-x-6 sm:grid-cols-2">
                    {items.map((p) => {
                      const holdable = isPermission(p.slug) && can(access, p.slug);
                      return (
                        <Checkbox
                          key={p.slug}
                          name="permission"
                          value={p.slug}
                          defaultChecked={isAdminRole || granted.has(p.slug)}
                          disabled={isAdminRole || !manage || !holdable}
                          label={pickName(p, locale)}
                          description={<span className="font-mono">{p.slug}</span>}
                        />
                      );
                    })}
                  </div>
                </fieldset>
              ))}
              {/* Permissions the editor cannot see or change must survive the save. */}
              {[...granted].filter((slug): slug is string => Boolean(slug) && !(isPermission(slug!) && can(access, slug as never))).map((slug) => (
                <input key={slug} type="hidden" name="permission" value={slug} />
              ))}
              {manage && !isAdminRole ? <SubmitButton>{t("savePermissions")}</SubmitButton> : null}
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
