import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Plus, Trash2 } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { createSchoolAction, grantScopeAction, revokeScopeAction, saveRegionAction, setSchoolStatusAction, updatePlatformIdentityAction } from "@/features/admin/management/actions";
import { ActionForm, ConfirmAction, FormDialog, SubmitButton } from "@/components/ui/action-form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { SelectField, TextField } from "@/components/ui/fields";
import { Checkbox, Fieldset } from "@/components/ui/form-controls";
import { TabNav } from "@/components/ui/misc";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { hasAdminScope, isPlatformAdmin } from "@/lib/auth/access";
import { requireAccess } from "@/lib/auth/guards";
import { formatNumber, formatPercent } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("platform") };
}

const LOCALES = [
  { code: "tg", suffix: "Tg" },
  { code: "ru", suffix: "Ru" },
  { code: "en", suffix: "En" },
] as const;

export default async function PlatformPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireAccess();
  const platform = isPlatformAdmin(access);
  if (!platform && !hasAdminScope(access)) redirect("/access-denied");
  const t = await getTranslations("admin.platform");
  const tl = await getTranslations("common.locales");
  const ts = await getTranslations("common.status");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const tabs = platform ? (["overview", "schools", "regions", "scopes", "identity"] as const) : (["overview"] as const);
  const tabRaw = firstValue((await searchParams).tab);
  const tab = tabs.find((x) => x === tabRaw) ?? "overview";
  const supabase = await createClient();

  const header = (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />} title={t("title")} description={platform ? t("descriptionPlatform") : t("descriptionScope")} />
      {tabs.length > 1 ? <TabNav label={t("sections")} items={tabs.map((key) => ({ href: key === "overview" ? "/admin/platform" : `/admin/platform?tab=${key}`, label: t(`tabs.${key}`), active: key === tab }))} /> : null}
    </>
  );

  if (tab === "overview") {
    const { data } = await supabase.rpc("scope_school_overview");
    return (
      <>
        {header}
        <DataTable
          caption={t("tabs.overview")}
          rows={data ?? []}
          rowKey={(r) => r.school_id ?? ""}
          empty={<EmptyState title={t("noSchools")} />}
          columns={[
            { key: "name", header: t("school"), primary: true, cell: (r) => <span className="font-medium">{r.short_name}</span> },
            { key: "students", header: t("students"), cell: (r) => <span className="tabular">{formatNumber(r.students, locale, 0)}</span> },
            { key: "staff", header: t("staff"), cell: (r) => <span className="tabular">{formatNumber(r.staff, locale, 0)}</span> },
            { key: "classes", header: t("classes"), hideOnMobile: true, cell: (r) => <span className="tabular">{formatNumber(r.classes, locale, 0)}</span> },
            { key: "attendance", header: t("attendance30d"), cell: (r) => <span className="tabular">{r.attendance_rate_30d === null ? "—" : formatPercent(r.attendance_rate_30d, locale)}</span> },
            { key: "pending", header: t("pending"), hideOnMobile: true, cell: (r) => ((r.pending_registrations ?? 0) > 0 ? <Badge tone="warning">{r.pending_registrations}</Badge> : "0") },
            { key: "status", header: t("status"), cell: (r) => <StatusBadge status={r.status ?? "active"} label={ts((r.status ?? "active") as "active")} /> },
          ]}
        />
      </>
    );
  }

  const [{ data: regions }, { data: districts }] = await Promise.all([
    supabase.from("regions").select("id, code, name_tg, name_ru, name_en").order("code"),
    supabase.from("districts").select("id, region_id, code, name_tg, name_ru, name_en").order("code"),
  ]);
  const regionOptions = (regions ?? []).map((r) => ({ value: r.id, label: `${r.code} · ${pickName(r, locale)}` }));
  const districtOptions = (districts ?? []).map((d) => ({ value: d.id, label: `${d.code} · ${pickName(d, locale)}` }));

  if (tab === "schools") {
    const { data: schools } = await supabase.from("schools").select("id, slug, short_name, code, id_prefix, status, region_id, district_id").order("short_name");
    return (
      <>
        {header}
        <Card>
          <CardHeader
            title={t("schools")}
            actions={
              <FormDialog action={createSchoolAction} trigger={<Button size="sm"><Plus aria-hidden />{t("newSchool")}</Button>} title={t("newSchool")} description={t("newSchoolHint")} submitLabel={tc("create")} size="md">
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField name="slug" label={t("slug")} hint={t("slugHint")} required maxLength={60} />
                  <TextField name="idPrefix" label={t("idPrefix")} hint={t("idPrefixHint")} required maxLength={6} />
                </div>
                <TextField name="shortName" label={t("shortName")} required maxLength={100} />
                <TextField name="fullName" label={t("fullName")} required maxLength={300} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <TextField name="code" label={t("code")} maxLength={40} />
                  <SelectField name="regionId" label={t("region")} placeholder={t("none")} options={regionOptions} />
                  <SelectField name="districtId" label={t("district")} placeholder={t("none")} options={districtOptions} />
                </div>
                <TextField name="address" label={t("address")} maxLength={500} />
                {/* The account that will run the school. It becomes this
                    school's administrator the moment it registers, once. */}
                <TextField
                  name="adminEmail"
                  type="email"
                  label={t("adminEmail")}
                  hint={t("adminEmailHint")}
                  inputMode="email"
                  maxLength={255}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField name="photoUrl" label={t("photoUrl")} hint={t("photoUrlHint")} maxLength={500} />
                  <TextField name="logoUrl" label={t("logoUrl")} maxLength={500} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <TextField name="telegram" label={t("telegram")} placeholder="@name" maxLength={200} />
                  <TextField name="instagram" label={t("instagram")} placeholder="@name" maxLength={200} />
                  <TextField name="whatsapp" label={t("whatsapp")} placeholder="+992 …" maxLength={200} />
                </div>
              </FormDialog>
            }
          />
          <CardBody className="p-0">
            <ul className="divide-y divide-line">
              {(schools ?? []).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <span>
                    <span className="font-medium">{s.short_name}</span>
                    <span className="block font-mono text-xs text-ink-muted">{s.slug} · {s.id_prefix}{s.code ? ` · ${s.code}` : ""}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={s.status} label={ts(s.status as "active")} />
                    {(["active", "inactive", "archived"] as const).filter((st) => st !== s.status).map((st) => (
                      <ConfirmAction
                        key={st}
                        action={setSchoolStatusAction}
                        fields={{ id: s.id, status: st }}
                        title={t("statusTitle", { name: s.short_name, status: ts(st) })}
                        description={st === "active" ? undefined : t("statusDescription")}
                        confirmLabel={ts(st)}
                        tone={st === "active" ? "primary" : "danger"}
                        trigger={<Button variant="ghost" size="sm">{ts(st)}</Button>}
                      />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </>
    );
  }

  if (tab === "regions") {
    return (
      <>
        {header}
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title={t("regions")} actions={
              <FormDialog action={saveRegionAction} trigger={<Button size="sm"><Plus aria-hidden />{t("newRegion")}</Button>} title={t("newRegion")} submitLabel={tc("create")}>
                <input type="hidden" name="kind" value="region" />
                <TextField name="code" label={t("code")} required maxLength={20} />
                <TextField name="nameTg" label={t("nameTg")} required maxLength={200} />
                <TextField name="nameRu" label={t("nameRu")} maxLength={200} />
                <TextField name="nameEn" label={t("nameEn")} maxLength={200} />
              </FormDialog>
            } />
            <CardBody>
              <ul className="divide-y divide-line text-sm">
                {(regions ?? []).map((r) => <li key={r.id} className="py-2"><span className="font-mono text-ink-muted">{r.code}</span> · {pickName(r, locale)}</li>)}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t("districts")} actions={
              <FormDialog action={saveRegionAction} trigger={<Button size="sm"><Plus aria-hidden />{t("newDistrict")}</Button>} title={t("newDistrict")} submitLabel={tc("create")}>
                <input type="hidden" name="kind" value="district" />
                <SelectField name="regionId" label={t("region")} required placeholder={t("chooseRegion")} options={regionOptions} />
                <TextField name="code" label={t("code")} required maxLength={20} />
                <TextField name="nameTg" label={t("nameTg")} required maxLength={200} />
                <TextField name="nameRu" label={t("nameRu")} maxLength={200} />
                <TextField name="nameEn" label={t("nameEn")} maxLength={200} />
              </FormDialog>
            } />
            <CardBody>
              <ul className="divide-y divide-line text-sm">
                {(districts ?? []).map((d) => <li key={d.id} className="py-2"><span className="font-mono text-ink-muted">{d.code}</span> · {pickName(d, locale)}</li>)}
              </ul>
            </CardBody>
          </Card>
        </div>
      </>
    );
  }

  if (tab === "scopes") {
    const [{ data: scopes }, { data: schools }] = await Promise.all([
      supabase.from("admin_scopes").select("id, user_id, scope_type, scope_role, region_id, district_id, school_id, created_at, users!admin_scopes_user_id_fkey(first_name, last_name, email)").order("created_at", { ascending: false }),
      supabase.from("schools").select("id, short_name").order("short_name"),
    ]);
    const regionName = new Map((regions ?? []).map((r) => [r.id, pickName(r, locale)]));
    const districtName = new Map((districts ?? []).map((d) => [d.id, pickName(d, locale)]));
    const schoolName = new Map((schools ?? []).map((s) => [s.id, s.short_name]));
    return (
      <>
        {header}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,26rem)_1fr]">
          <Card>
            <CardHeader title={t("grantScope")} description={t("grantScopeHint")} />
            <CardBody>
              <ActionForm action={grantScopeAction} className="space-y-3" resetOnSuccess>
                <TextField name="userId" label={t("userId")} hint={t("userIdHint")} required maxLength={36} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField name="scopeType" label={t("scopeType")} options={(["platform", "region", "district", "school"] as const).map((s) => ({ value: s, label: t(`scopeTypes.${s}`) }))} />
                  <SelectField name="scopeRole" label={t("scopeRole")} options={(["ministry_admin", "regional_admin", "district_admin", "school_auditor", "super_admin"] as const).map((s) => ({ value: s, label: t(`scopeRoles.${s}`) }))} />
                </div>
                <SelectField name="regionId" label={t("region")} placeholder={t("none")} options={regionOptions} />
                <SelectField name="districtId" label={t("district")} placeholder={t("none")} options={districtOptions} />
                <SelectField name="schoolId" label={t("school")} placeholder={t("none")} options={(schools ?? []).map((s) => ({ value: s.id, label: s.short_name }))} />
                <SubmitButton>{t("grant")}</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t("scopes")} />
            <CardBody className="p-0">
              {(scopes ?? []).length === 0 ? <EmptyState title={t("noScopes")} /> : (
                <ul className="divide-y divide-line">
                  {(scopes ?? []).map((s) => {
                    const user = s.users as unknown as { first_name: string; last_name: string; email: string } | null;
                    const target = s.region_id ? regionName.get(s.region_id) : s.district_id ? districtName.get(s.district_id) : s.school_id ? schoolName.get(s.school_id) : t("scopeTypes.platform");
                    return (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                        <span>
                          <span className="font-medium">{user ? `${user.last_name} ${user.first_name}` : s.user_id}</span>
                          <span className="block text-sm text-ink-muted">{t(`scopeRoles.${s.scope_role as "district_admin"}`)} · {target}</span>
                        </span>
                        {s.user_id !== access.userId ? (
                          <ConfirmAction action={revokeScopeAction} fields={{ id: s.id }} title={t("revokeTitle")} confirmLabel={t("revoke")} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("revoke")}><Trash2 aria-hidden /></Button>} />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </>
    );
  }

  // Platform identity (owner-supplied, never invented).
  const { data: identity } = await supabase.from("platform_identity").select("*").limit(1).maybeSingle();
  return (
    <>
      {header}
      <Card className="max-w-4xl">
        <CardHeader title={t("identity")} description={t("identityHint")} />
        <CardBody>
          <ActionForm action={updatePlatformIdentityAction} className="space-y-5">
            {(["platformName", "authorityName", "footerAttribution", "copyright"] as const).map((field) => {
              const column = field === "platformName" ? "platform_name" : field === "authorityName" ? "authority_name" : field === "footerAttribution" ? "footer_attribution" : "copyright";
              return (
                <Fieldset key={field} legend={t(`identityFields.${field}`)}>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {LOCALES.map(({ code, suffix }) => (
                      <TextField
                        key={code}
                        name={`${field}${suffix}`}
                        id={`${field}-${code}`}
                        label={tl(code)}
                        defaultValue={((identity as Record<string, unknown> | null)?.[`${column}_${code}`] as string | null) ?? ""}
                        maxLength={field === "footerAttribution" ? 500 : 300}
                      />
                    ))}
                  </div>
                </Fieldset>
              );
            })}
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField name="supportEmail" type="email" label={t("supportEmail")} defaultValue={identity?.support_email ?? ""} maxLength={255} />
              <TextField name="supportPhone" type="tel" label={t("supportPhone")} defaultValue={identity?.support_phone ?? ""} maxLength={50} />
              <TextField name="emblemUrl" type="url" label={t("emblemUrl")} hint={t("emblemUrlHint")} defaultValue={identity?.emblem_url ?? ""} maxLength={500} />
            </div>
            <Checkbox name="isApproved" defaultChecked={identity?.is_approved} label={t("approved")} description={t("approvedHint")} />
            <SubmitButton>{tc("saveChanges")}</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
