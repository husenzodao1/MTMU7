import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { updateSchoolProfileAction } from "@/features/admin/management/actions";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { DirectUpload } from "@/components/ui/direct-upload";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { Checkbox, Fieldset } from "@/components/ui/form-controls";
import { Alert, Card, CardBody, DescriptionList, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("school") };
}

const LOCALES = [
  { code: "tg", suffix: "Tg" },
  { code: "ru", suffix: "Ru" },
  { code: "en", suffix: "En" },
] as const;

export default async function SchoolProfilePage() {
  const access = await requirePermission("schools.update", "settings.view");
  const t = await getTranslations("admin.school");
  const tl = await getTranslations("common.locales");
  const tc = await getTranslations("common");
  const editable = can(access, "schools.update");
  const supabase = await createClient();
  const { data: school } = await supabase
    .from("schools")
    .select("id, slug, code, id_prefix, status, short_name, full_name, official_name_tg, official_name_ru, official_name_en, description_tg, description_ru, description_en, address, phone, email, website, director_name, working_hours_tg, working_hours_ru, working_hours_en, timezone, default_locale, logo_url, photo_url")
    .eq("id", access.school!.id)
    .maybeSingle();
  if (!school) return <Alert tone="danger">{t("loadError")}</Alert>;

  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />} title={t("title")} description={t("description")} />
      <Alert tone="warning" className="mb-5" title={t("officialTitle")}>{t("officialHint")}</Alert>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardBody>
            <ActionForm action={updateSchoolProfileAction} className="space-y-5">
              <fieldset disabled={!editable} className="space-y-5">
                <Fieldset legend={t("names")}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField name="shortName" label={t("shortName")} hint={t("shortNameHint")} defaultValue={school.short_name} required maxLength={100} />
                    <TextField name="fullName" label={t("fullName")} defaultValue={school.full_name} required maxLength={300} />
                  </div>
                  {LOCALES.map(({ code, suffix }) => (
                    <TextField key={code} name={`officialName${suffix}`} label={t("officialName", { language: tl(code) })} defaultValue={school[`official_name_${code}`] ?? ""} maxLength={300} />
                  ))}
                </Fieldset>
                <Fieldset legend={t("about")}>
                  {LOCALES.map(({ code, suffix }) => (
                    <TextAreaField key={code} name={`description${suffix}`} label={t("descriptionField", { language: tl(code) })} defaultValue={school[`description_${code}`] ?? ""} rows={3} maxLength={5000} />
                  ))}
                  <TextField name="directorName" label={t("director")} defaultValue={school.director_name ?? ""} maxLength={200} />
                </Fieldset>
                <Fieldset legend={t("contacts")}>
                  <TextField name="address" label={t("address")} defaultValue={school.address ?? ""} maxLength={500} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <TextField name="phone" type="tel" label={t("phone")} defaultValue={school.phone ?? ""} maxLength={50} />
                    <TextField name="email" type="email" label={t("email")} defaultValue={school.email ?? ""} maxLength={255} />
                    <TextField name="website" type="url" label={t("website")} defaultValue={school.website ?? ""} maxLength={300} placeholder="https://" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {LOCALES.map(({ code, suffix }) => (
                      <TextField key={code} name={`workingHours${suffix}`} label={t("hours", { language: tl(code) })} defaultValue={school[`working_hours_${code}`] ?? ""} maxLength={300} />
                    ))}
                  </div>
                </Fieldset>
                <Fieldset legend={t("regional")}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField name="timezone" label={t("timezone")} hint={t("timezoneHint")} defaultValue={school.timezone} required maxLength={64} />
                    <SelectField name="defaultLocale" label={t("defaultLocale")} defaultValue={school.default_locale} options={(["tg", "ru", "en"] as const).map((l) => ({ value: l, label: tl(l) }))} />
                  </div>
                </Fieldset>
                <Fieldset legend={t("images")}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      {school.logo_url ? (
                        <div className="flex items-center gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element -- current school logo */}
                          <img src={school.logo_url} alt="" className="h-14 w-auto rounded border border-line" />
                          <Checkbox name="logoRemove" label={t("removeImage")} />
                        </div>
                      ) : null}
                      <DirectUpload kind="image" folder={`${school.id}/identity`} name="logo" label={t("logo")} hint={t("imageHint")} />
                    </div>
                    <div className="space-y-2">
                      {school.photo_url ? (
                        <div className="flex items-center gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element -- current school photograph */}
                          <img src={school.photo_url} alt="" className="h-14 w-auto rounded border border-line" />
                          <Checkbox name="photoRemove" label={t("removeImage")} />
                        </div>
                      ) : null}
                      <DirectUpload kind="image" folder={`${school.id}/identity`} name="photo" label={t("photo")} hint={t("imageHint")} />
                    </div>
                  </div>
                </Fieldset>
              </fieldset>
              {editable ? <SubmitButton>{tc("saveChanges")}</SubmitButton> : null}
            </ActionForm>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="mb-3 text-base font-semibold">{t("platformManaged")}</h2>
            <DescriptionList
              items={[
                { term: t("slug"), description: <span className="font-mono">{school.slug}</span> },
                { term: t("code"), description: school.code ?? "—" },
                { term: t("idPrefix"), description: <span className="font-mono">{school.id_prefix}</span> },
                { term: t("status"), description: tc(`status.${school.status as "active"}`) },
              ]}
            />
            <p className="mt-3 text-xs text-ink-muted">{t("platformManagedHint")}</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
