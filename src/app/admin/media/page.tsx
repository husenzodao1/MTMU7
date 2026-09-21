import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ImagePlus, Images, Trash2 } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { deleteMediaAction, registerMediaAction } from "@/features/admin/content/media-actions";
import { publicMediaUrl } from "@/features/content/queries";
import { ConfirmAction, FormDialog } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { DirectUpload } from "@/components/ui/direct-upload";
import { TextField } from "@/components/ui/fields";
import { Pagination } from "@/components/ui/pagination";
import { Card, EmptyState, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { formatBytes } from "@/lib/storage/files";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("media") };
}

export default async function AdminMediaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("media.upload", "media.manage");
  const t = await getTranslations("admin.media");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const list = parseListParams(params, { sorts: ["recent"], defaultSort: "recent", pageSize: 24 });
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("media_assets")
    .select("id, bucket, storage_path, file_name, size_bytes, alt_text, created_at", { count: "exact" })
    .eq("school_id", access.school!.id)
    .eq("bucket", "public-media")
    .order("created_at", { ascending: false })
    .range(list.offset, list.offset + list.pageSize - 1);

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />}
        title={t("title")}
        description={t("description")}
        actions={
          <FormDialog action={registerMediaAction} trigger={<Button><ImagePlus aria-hidden />{t("upload")}</Button>} title={t("upload")} description={t("uploadHint")} submitLabel={t("save")}>
            <DirectUpload kind="image" folder={`${access.school!.id}/media`} name="image" label={t("image")} />
            <TextField name="altText" label={t("altText")} hint={t("altTextHint")} required maxLength={300} />
          </FormDialog>
        }
      />
      {!data || data.length === 0 ? (
        <Card as="div"><EmptyState icon={<Images />} title={t("empty")} description={t("emptyHint")} /></Card>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {data.map((asset) => {
            const url = publicMediaUrl(asset.storage_path) ?? "";
            return (
              <li key={asset.id} className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element -- public school media */}
                <img src={url} alt={asset.alt_text ?? ""} className="aspect-square w-full object-cover" loading="lazy" />
                <div className="flex flex-1 flex-col gap-1 p-2.5 text-xs">
                  <p className="line-clamp-2 text-ink">{asset.alt_text}</p>
                  <p className="text-ink-muted">{formatBytes(asset.size_bytes)} · {formatDate(asset.created_at, locale)}</p>
                  <label className="mt-1 block">
                    <span className="sr-only">{t("url")}</span>
                    <input readOnly value={url} className="w-full rounded border border-line bg-surface-muted px-1.5 py-1 font-mono text-[0.6875rem]" />
                  </label>
                  {can(access, "media.manage") ? (
                    <ConfirmAction action={deleteMediaAction} fields={{ id: asset.id }} title={t("deleteTitle")} description={t("deleteDescription")} confirmLabel={tc("delete")} trigger={<Button variant="ghost" size="sm" className="mt-1 self-start"><Trash2 aria-hidden />{tc("delete")}</Button>} />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination pathname="/admin/media" searchParams={params} page={list.page} pageSize={list.pageSize} total={count ?? 0} />
    </>
  );
}
