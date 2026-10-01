import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { BookOpen, Download, ExternalLink } from "lucide-react";
import { FavoriteButton } from "@/features/library/favorite-button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Alert, Breadcrumb, Card, CardBody, DescriptionList, PageHeader } from "@/components/ui/surface";
import { canAny } from "@/lib/auth/access";
import { requireModule } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import { formatBytes } from "@/lib/storage/files";
import { createClient } from "@/lib/supabase/server";

async function loadBook(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("library_items")
    .select("id, school_id, title, subtitle, author, description, cover_url, file_url, file_name, file_size, file_type, language, publication_year, publisher, isbn, page_count, grade_level, tags, shelf_location, quantity, available_quantity, status, library_categories(name_tg, name_ru, name_en), subjects(name_tg, name_ru, name_en)")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const book = await loadBook((await params).id);
  return book ? { title: book.title } : {};
}

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireModule("library");
  const { id } = await params;
  const book = await loadBook(id);
  if (!book || book.school_id !== access.school!.id) notFound();

  const t = await getTranslations("portal.library");
  const ts = await getTranslations("common.status");
  const tl = await getTranslations("common.locales");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const [{ data: favorite }, { data: history }] = await Promise.all([
    supabase.from("library_favorites").select("item_id").eq("user_id", access.userId).eq("item_id", id).maybeSingle(),
    supabase.from("library_reading_history").select("opened_at").eq("user_id", access.userId).eq("item_id", id).maybeSingle(),
  ]);

  const category = book.library_categories as { name_tg: string; name_ru: string | null; name_en: string | null } | null;
  const subject = book.subjects as { name_tg: string; name_ru: string | null; name_en: string | null } | null;
  const readable = book.file_type === "pdf" || book.file_type === "audio" || book.file_type === "image";

  const details = [
    book.author ? { term: t("author"), description: book.author } : null,
    category ? { term: t("category"), description: pickName(category, locale) } : null,
    subject ? { term: t("subject"), description: pickName(subject, locale) } : null,
    book.grade_level ? { term: t("gradeLevel"), description: t("grade", { grade: book.grade_level }) } : null,
    { term: t("language"), description: tl(book.language as "tg" | "ru" | "en") },
    book.publisher ? { term: t("publisher"), description: book.publisher } : null,
    book.publication_year ? { term: t("year"), description: String(book.publication_year) } : null,
    book.isbn ? { term: "ISBN", description: book.isbn } : null,
    book.page_count ? { term: t("pages"), description: String(book.page_count) } : null,
    book.quantity > 0 ? { term: t("copies"), description: t("copiesValue", { available: book.available_quantity, total: book.quantity }) } : null,
    book.shelf_location ? { term: t("shelf"), description: book.shelf_location } : null,
  ].filter((item): item is { term: string; description: string } => item !== null);

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb label={t("breadcrumb")} items={[{ label: t("title"), href: "/library" }, { label: book.title }]} />}
        title={book.title}
        description={book.subtitle}
        meta={book.tags.map((tag) => <Badge key={tag}>#{tag}</Badge>)}
        actions={canAny(access, ["library.update", "library.publish"]) ? (
          <Link href={`/admin/library/${book.id}`} className={buttonClasses("secondary")}>{t("editBook")}</Link>
        ) : null}
      />
      {book.status !== "published" ? (
        <Alert tone="warning" className="mb-4" title={t("notPublished")}>
          <StatusBadge status={book.status} label={ts(book.status)} />
        </Alert>
      ) : null}
      <div className="grid gap-6 md:grid-cols-[minmax(0,15rem)_1fr]">
        <div className="space-y-3">
          <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-muted">
            {book.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- cover served through a short-lived signed URL
              <img src={`/files/covers/${book.id}`} alt={t("coverOf", { title: book.title })} className="h-full w-full object-cover" />
            ) : (
              <BookOpen className="size-12 text-ink-muted" aria-hidden />
            )}
          </div>
          {book.file_url ? (
            <div className="flex flex-col gap-2">
              {readable ? (
                <a href={`/files/library/${book.id}`} target="_blank" rel="noopener" className={buttonClasses("primary")}>
                  <ExternalLink aria-hidden />
                  {t("read")}
                </a>
              ) : null}
              <a href={`/files/library/${book.id}?download=1`} className={buttonClasses(readable ? "secondary" : "primary")}>
                <Download aria-hidden />
                {t("download", { size: formatBytes(book.file_size ?? 0) })}
              </a>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">{t("printOnly")}</p>
          )}
          <FavoriteButton itemId={book.id} isFavorite={Boolean(favorite)} />
          {history ? <p className="text-xs text-ink-muted">{t("lastOpened", { date: formatDateTime(history.opened_at, locale) })}</p> : null}
        </div>
        <div className="space-y-5">
          {book.description ? (
            <Card as="div">
              <CardBody>
                <p className="whitespace-pre-line leading-relaxed">{book.description}</p>
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardBody>
              <DescriptionList items={details} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
