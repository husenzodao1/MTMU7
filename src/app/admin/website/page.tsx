import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CircleCheck, ExternalLink, FilePlus2, Pencil, TriangleAlert } from "lucide-react";
import { savePageAction, saveSiteSectionAction } from "@/features/admin/content/website-actions";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { publicMediaUrl } from "@/features/content/queries";
import { readSectionContent, SECTION_DEFINITIONS, SECTION_KEYS, type SectionKey } from "@/features/site/sections";
import { FormDialog } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { DirectUpload } from "@/components/ui/direct-upload";
import { TextAreaField, TextField } from "@/components/ui/fields";
import { Checkbox, Fieldset } from "@/components/ui/form-controls";
import { TabNav } from "@/components/ui/misc";
import { Alert, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("website") };
}

const LOCALES = ["tg", "ru", "en"] as const;

export default async function AdminWebsitePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("cms.manage");
  const t = await getTranslations("admin.website");
  const tl = await getTranslations("common.locales");
  const tc = await getTranslations("common");
  const params = await searchParams;
  const tab = firstValue(params.tab) === "pages" ? "pages" : "sections";
  const schoolId = access.school!.id;
  const supabase = await createClient();

  const tabs = (
    <TabNav label={t("sectionsLabel")} items={[{ href: "/admin/website", label: t("tabs.sections"), active: tab === "sections" }, { href: "/admin/website?tab=pages", label: t("tabs.pages"), active: tab === "pages" }]} />
  );
  const header = (
    <PageHeader
      breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />}
      title={t("title")}
      description={t("description")}
      actions={<Link href={`/s/${access.school!.slug}`} className={buttonClasses("secondary")} target="_blank" rel="noopener"><ExternalLink aria-hidden />{t("openSite")}</Link>}
    />
  );

  if (tab === "pages") {
    const { data: pages } = await supabase
      .from("pages")
      .select("id, slug, title_tg, title_ru, title_en, is_published, sort_order, content_blocks(section, body_tg, body_ru, body_en)")
      .eq("school_id", schoolId)
      .order("sort_order");
    const pageFields = (page?: NonNullable<typeof pages>[number]) => {
      const block = ((page?.content_blocks ?? []) as Array<{ section: string; body_tg: string | null; body_ru: string | null; body_en: string | null }>).find((b) => b.section === "page");
      return (
        <>
          {page ? <input type="hidden" name="id" value={page.id} /> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField name="slug" label={t("slug")} hint={t("slugHint")} defaultValue={page?.slug} required maxLength={80} />
            <TextField name="sortOrder" type="number" min={0} label={t("order")} defaultValue={page?.sort_order ?? 0} />
          </div>
          {LOCALES.map((locale) => {
            const cap = locale === "tg" ? "Tg" : locale === "ru" ? "Ru" : "En";
            return (
              <Fieldset key={locale} legend={tl(locale)}>
                <TextField name={`title${cap}`} label={t("pageTitle")} defaultValue={(page?.[`title_${locale}` as "title_tg"] ?? "") as string} required={locale === "tg"} maxLength={200} />
                <TextAreaField name={`body${cap}`} label={t("pageBody")} hint={t("bodyHint")} defaultValue={(block?.[`body_${locale}` as "body_tg"] ?? "") as string} rows={8} maxLength={50000} />
              </Fieldset>
            );
          })}
          <Checkbox name="isPublished" defaultChecked={page?.is_published} label={t("published")} />
        </>
      );
    };
    return (
      <>
        {header}
        {tabs}
        <Card>
          <CardHeader title={t("pages")} description={t("pagesHint")} actions={<FormDialog action={savePageAction} trigger={<Button size="sm"><FilePlus2 aria-hidden />{t("newPage")}</Button>} title={t("newPage")} submitLabel={tc("create")} size="lg">{pageFields()}</FormDialog>} />
          <CardBody className="p-0">
            {(pages ?? []).length === 0 ? <EmptyState title={t("noPages")} /> : (
              <ul className="divide-y divide-line">
                {(pages ?? []).map((page) => (
                  <li key={page.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <span>
                      <span className="font-medium">{page.title_tg}</span>
                      <span className="block font-mono text-xs text-ink-muted">/s/{access.school!.slug}/pages/{page.slug}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {page.is_published ? <Badge tone="success">{t("published")}</Badge> : <Badge>{t("hidden")}</Badge>}
                      <FormDialog action={savePageAction} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("editPage", { name: page.title_tg })}><Pencil aria-hidden /></Button>} title={t("editPageTitle")} submitLabel={tc("save")} size="lg">{pageFields(page)}</FormDialog>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </>
    );
  }

  const { data: sections } = await supabase.from("site_sections").select("section_key, is_enabled, sort_order, content, is_approved, updated_at").eq("school_id", schoolId).order("sort_order");
  const pendingApproval = (sections ?? []).filter((s) => SECTION_DEFINITIONS[s.section_key as SectionKey]?.requiresApproval && s.is_enabled && !s.is_approved);

  return (
    <>
      {header}
      {tabs}
      {pendingApproval.length > 0 ? (
        <Alert tone="warning" className="mb-4" title={t("approvalTitle")}>
          <p>{t("approvalHint")}</p>
          <ul className="mt-2 list-disc ps-5">
            {pendingApproval.map((s) => <li key={s.section_key}>{t(`sections.${s.section_key as SectionKey}.name`)}</li>)}
          </ul>
        </Alert>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {SECTION_KEYS.map((key) => {
          const row = (sections ?? []).find((s) => s.section_key === key);
          if (!row) return null;
          const definition = SECTION_DEFINITIONS[key];
          const content = readSectionContent(row.content);
          const filled = LOCALES.some((l) => Object.keys(content[l] ?? {}).length > 0);
          return (
            <Card key={key}>
              <CardHeader
                title={t(`sections.${key}.name`)}
                description={t(`sections.${key}.hint`)}
                actions={
                  <FormDialog action={saveSiteSectionAction} trigger={<Button variant="secondary" size="sm"><Pencil aria-hidden />{tc("edit")}</Button>} title={t(`sections.${key}.name`)} description={t(`sections.${key}.hint`)} submitLabel={tc("save")} size="lg">
                    <input type="hidden" name="sectionKey" value={key} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Checkbox name="isEnabled" defaultChecked={row.is_enabled} label={t("enabled")} />
                      <TextField name="sortOrder" type="number" min={0} max={100} label={t("order")} defaultValue={row.sort_order} />
                    </div>
                    {definition.localized.length > 0 ? LOCALES.map((locale) => (
                      <Fieldset key={locale} legend={tl(locale)}>
                        {definition.localized.map((field) =>
                          field.kind === "text" ? (
                            <TextField key={field.name} name={`${locale}_${field.name}`} id={`${key}-${locale}-${field.name}`} label={t(`fields.${field.name}`)} defaultValue={content[locale]?.[field.name] ?? ""} maxLength={field.maxLength} />
                          ) : (
                            <TextAreaField key={field.name} name={`${locale}_${field.name}`} id={`${key}-${locale}-${field.name}`} label={t(`fields.${field.name}`)} hint={field.kind === "lines" ? t(`linesHint.${key === "links" ? "links" : "statistics"}`) : undefined} defaultValue={content[locale]?.[field.name] ?? ""} rows={field.kind === "lines" ? 5 : 4} maxLength={field.maxLength} />
                          )
                        )}
                      </Fieldset>
                    )) : null}
                    {definition.shared.map((field) =>
                      field.kind === "image" ? (
                        <div key={field.name} className="space-y-2">
                          {content.shared?.[field.name] ? (
                            <div className="flex items-center gap-3">
                              {/* eslint-disable-next-line @next/next/no-img-element -- preview of the stored public image */}
                              <img src={publicMediaUrl(content.shared[field.name]) ?? ""} alt="" className="h-16 w-auto rounded border border-line" />
                              <Checkbox name={`shared_${field.name}Remove`} label={t("removeImage")} />
                            </div>
                          ) : null}
                          <DirectUpload kind="image" folder={`${schoolId}/site`} name={`shared_${field.name}`} label={t(`fields.${field.name}`)} hint={t("imageHint")} />
                        </div>
                      ) : (
                        <TextField key={field.name} name={`shared_${field.name}`} id={`${key}-shared-${field.name}`} type={field.kind === "number" ? "number" : field.kind === "email" ? "email" : field.kind === "phone" ? "tel" : "url"} label={t(`fields.${field.name}`)} defaultValue={content.shared?.[field.name] ?? ""} />
                      )
                    )}
                    {definition.requiresApproval ? (
                      <Alert tone="warning" title={t("officialContent")}>
                        <p className="mb-2">{t("officialContentHint")}</p>
                        <Checkbox name="approve" defaultChecked={row.is_approved} label={t("approveLabel")} />
                      </Alert>
                    ) : null}
                  </FormDialog>
                }
              />
              <CardBody className="flex flex-wrap gap-2">
                {row.is_enabled ? <Badge tone="success">{t("enabled")}</Badge> : <Badge>{t("disabled")}</Badge>}
                {definition.requiresApproval ? (
                  row.is_approved ? <Badge tone="success"><CircleCheck className="size-3" aria-hidden />{t("approved")}</Badge> : <Badge tone="warning"><TriangleAlert className="size-3" aria-hidden />{t("notApproved")}</Badge>
                ) : null}
                {!filled && definition.localized.some((f) => f.name !== "title") ? <Badge tone="warning">{t("empty")}</Badge> : null}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
