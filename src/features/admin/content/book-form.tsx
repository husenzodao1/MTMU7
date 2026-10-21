"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ActionForm, SubmitButton, useFieldError } from "@/components/ui/action-form";
import { DirectUpload } from "@/components/ui/direct-upload";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { Checkbox, Fieldset } from "@/components/ui/form-controls";
import { saveBookAction } from "@/features/admin/content/library-actions";
import { CONTENT_LANGUAGES, LIBRARY_VISIBILITY } from "@/features/content/constants";

export interface BookFormValues {
  id: string;
  title: string;
  subtitle: string | null;
  author: string | null;
  description: string | null;
  categoryId: string | null;
  subjectId: string | null;
  gradeLevel: number | null;
  language: string;
  publisher: string | null;
  publicationYear: number | null;
  isbn: string | null;
  pageCount: number | null;
  tags: string[];
  shelfLocation: string | null;
  quantity: number;
  availableQuantity: number;
  visibility: string;
  isFeatured: boolean;
  status: string;
  fileName: string | null;
  hasCover: boolean;
  accessRoleIds: string[];
  accessClassIds: string[];
}

type Option = { value: string; label: string };

function AccessError() {
  const error = useFieldError("accessRoleId");
  return error ? <p className="text-sm font-medium text-danger-700" role="alert">{error}</p> : null;
}

export function BookForm({
  book,
  schoolId,
  categories,
  subjects,
  roles,
  classes,
  canPublish,
  canArchive,
}: {
  book: BookFormValues | null;
  schoolId: string;
  categories: Option[];
  subjects: Option[];
  roles: Option[];
  classes: Option[];
  canPublish: boolean;
  canArchive: boolean;
}) {
  const t = useTranslations("admin.library");
  const tl = useTranslations("common.locales");
  const [visibility, setVisibility] = useState(book?.visibility ?? "all");
  const status = book?.status ?? "draft";

  return (
    <ActionForm action={saveBookAction} className="grid gap-5 lg:grid-cols-3">
      <button type="submit" name="intent" value={status === "published" ? "publish" : status === "archived" ? "restore" : "draft"} hidden tabIndex={-1} aria-hidden />
      {book ? <input type="hidden" name="id" value={book.id} /> : null}
      <div className="space-y-5 lg:col-span-2">
        <Fieldset legend={t("bibliographic")}>
          <TextField name="title" label={t("titleField")} defaultValue={book?.title} required maxLength={500} />
          <TextField name="subtitle" label={t("subtitle")} defaultValue={book?.subtitle ?? ""} maxLength={500} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField name="author" label={t("author")} defaultValue={book?.author ?? ""} maxLength={300} />
            <TextField name="publisher" label={t("publisher")} defaultValue={book?.publisher ?? ""} maxLength={200} />
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <TextField name="publicationYear" type="number" min={1800} max={2100} label={t("year")} defaultValue={book?.publicationYear ?? ""} />
            <TextField name="pageCount" type="number" min={1} label={t("pages")} defaultValue={book?.pageCount ?? ""} />
            <TextField name="isbn" label="ISBN" defaultValue={book?.isbn ?? ""} maxLength={20} className="sm:col-span-2" />
          </div>
          <TextAreaField name="description" label={t("descriptionField")} defaultValue={book?.description ?? ""} rows={5} maxLength={5000} />
        </Fieldset>
        <Fieldset legend={t("classification")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField name="categoryId" label={t("category")} defaultValue={book?.categoryId ?? ""} placeholder={t("noCategory")} options={categories} />
            <SelectField name="language" label={t("language")} defaultValue={book?.language ?? "tg"} options={CONTENT_LANGUAGES.map((l) => ({ value: l, label: tl(l) }))} />
            <SelectField name="subjectId" label={t("subject")} defaultValue={book?.subjectId ?? ""} placeholder={t("noSubject")} options={subjects} />
            <SelectField name="gradeLevel" label={t("gradeLevel")} defaultValue={book?.gradeLevel ? String(book.gradeLevel) : ""} placeholder={t("allGrades")} options={Array.from({ length: 11 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
          </div>
          <TextField name="tags" label={t("tags")} hint={t("tagsHint")} defaultValue={book?.tags.join(", ")} maxLength={500} />
        </Fieldset>
        <Fieldset legend={t("files")}>
          {book?.fileName ? (
            <div className="space-y-1">
              <p className="text-sm">{t("currentFile", { name: book.fileName })}</p>
              <Checkbox name="removeFile" label={t("removeFile")} />
            </div>
          ) : null}
          <DirectUpload kind="book" folder={`${schoolId}/books`} name="file" label={book?.fileName ? t("replaceFile") : t("file")} hint={t("fileHint")} />
          <DirectUpload kind="cover" folder={`${schoolId}/covers`} name="cover" label={book?.hasCover ? t("replaceCover") : t("cover")} />
        </Fieldset>
      </div>
      <div className="space-y-5">
        <Fieldset legend={t("access")}>
          <SelectField name="visibility" label={t("visibility")} value={visibility} onChange={(e) => setVisibility(e.target.value)} options={LIBRARY_VISIBILITY.map((v) => ({ value: v, label: t(`visibilities.${v}`) }))} />
          {visibility === "specific" ? (
            <div className="space-y-2">
              <fieldset>
                <legend className="text-sm font-medium">{t("roles")}</legend>
                {roles.map((r) => <Checkbox key={r.value} name="accessRoleId" value={r.value} defaultChecked={book?.accessRoleIds.includes(r.value)} label={r.label} />)}
              </fieldset>
              <fieldset>
                <legend className="text-sm font-medium">{t("classes")}</legend>
                <div className="grid max-h-48 grid-cols-2 overflow-y-auto">
                  {classes.map((c) => <Checkbox key={c.value} name="accessClassId" value={c.value} defaultChecked={book?.accessClassIds.includes(c.value)} label={c.label} />)}
                </div>
              </fieldset>
              <AccessError />
            </div>
          ) : null}
          <Checkbox name="isFeatured" defaultChecked={book?.isFeatured} label={t("featured")} />
        </Fieldset>
        <Fieldset legend={t("printCopies")}>
          <div className="grid grid-cols-2 gap-3">
            <TextField name="quantity" type="number" min={0} label={t("quantity")} defaultValue={book?.quantity ?? 0} />
            <TextField name="availableQuantity" type="number" min={0} label={t("available")} defaultValue={book?.availableQuantity ?? 0} />
          </div>
          <TextField name="shelfLocation" label={t("shelf")} defaultValue={book?.shelfLocation ?? ""} maxLength={100} />
        </Fieldset>
        <div className="flex flex-col gap-2">
          {canPublish && status !== "archived" ? <SubmitButton name="intent" value="publish">{status === "published" ? t("savePublished") : t("publish")}</SubmitButton> : null}
          {status !== "published" && status !== "archived" ? <SubmitButton name="intent" value="draft" variant="secondary">{t("saveDraft")}</SubmitButton> : null}
          {canArchive && book && status !== "archived" ? <SubmitButton name="intent" value="archive" variant="ghost">{t("archive")}</SubmitButton> : null}
          {status === "archived" && canArchive ? <SubmitButton name="intent" value="restore" variant="secondary">{t("restore")}</SubmitButton> : null}
        </div>
      </div>
    </ActionForm>
  );
}
