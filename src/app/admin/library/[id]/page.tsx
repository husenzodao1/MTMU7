import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { BookForm } from "@/features/admin/content/book-form";
import { deleteBookDraftAction } from "@/features/admin/content/library-actions";
import { getBookFormOptions } from "@/features/admin/content/library-options";
import { ConfirmAction } from "@/components/ui/action-form";
import { StatusBadge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Alert, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import type { Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { robots: { index: false } };

export default async function EditBookPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("library.create", "library.update", "library.publish", "library.archive");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const saved = firstValue((await searchParams).saved);
  const t = await getTranslations("admin.library");
  const ts = await getTranslations("common.status");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const { data: book } = await supabase
    .from("library_items")
    .select("id, school_id, title, subtitle, author, description, category_id, subject_id, grade_level, language, publisher, publication_year, isbn, page_count, tags, shelf_location, quantity, available_quantity, visibility, is_featured, status, file_name, cover_url, published_at, library_item_access(role_id, class_id)")
    .eq("id", id)
    .maybeSingle();
  if (!book || book.school_id !== access.school!.id) notFound();
  const options = await getBookFormOptions(access.school!.id, locale);
  const accessRows = (book.library_item_access ?? []) as Array<{ role_id: string | null; class_id: string | null }>;

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/library" }, { label: book.title }]} />}
        title={book.title}
        meta={<StatusBadge status={book.status} label={ts(book.status as "draft")} />}
        actions={
          <>
            {book.status === "published" ? <Link href={`/library/${book.id}`} className={buttonClasses("secondary")}>{t("viewInCatalog")}</Link> : null}
            {book.status === "draft" && !book.published_at && can(access, "library.archive") ? (
              <ConfirmAction action={deleteBookDraftAction} fields={{ id: book.id }} title={t("deleteTitle")} description={t("deleteDescription")} confirmLabel={tc("delete")} trigger={<Button variant="danger-outline">{tc("delete")}</Button>} />
            ) : null}
          </>
        }
      />
      {saved ? <Alert tone="success" className="mb-4">{t.has(`saved.${saved}`) ? t(`saved.${saved}`) : tc("saved")}</Alert> : null}
      <BookForm
        book={{
          id: book.id,
          title: book.title,
          subtitle: book.subtitle,
          author: book.author,
          description: book.description,
          categoryId: book.category_id,
          subjectId: book.subject_id,
          gradeLevel: book.grade_level,
          language: book.language,
          publisher: book.publisher,
          publicationYear: book.publication_year,
          isbn: book.isbn,
          pageCount: book.page_count,
          tags: book.tags,
          shelfLocation: book.shelf_location,
          quantity: book.quantity,
          availableQuantity: book.available_quantity,
          visibility: book.visibility,
          isFeatured: book.is_featured,
          status: book.status,
          fileName: book.file_name,
          hasCover: Boolean(book.cover_url),
          accessRoleIds: accessRows.map((a) => a.role_id).filter((x): x is string => Boolean(x)),
          accessClassIds: accessRows.map((a) => a.class_id).filter((x): x is string => Boolean(x)),
        }}
        schoolId={access.school!.id}
        {...options}
        canPublish={can(access, "library.publish")}
        canArchive={can(access, "library.archive")}
      />
    </>
  );
}
