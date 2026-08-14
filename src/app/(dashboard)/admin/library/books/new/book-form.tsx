"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createBookAction } from "../actions";
import type { AdminCategory } from "../../actions";

interface BookFormProps {
  categories: AdminCategory[];
}

export function BookForm({ categories }: BookFormProps) {
  const t = useTranslations("library");
  const [state, formAction, isPending] = useActionState(createBookAction, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("addBook")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                {t("title")} *
              </label>
              <input
                name="title"
                required
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                {t("author")}
              </label>
              <input
                name="author"
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-300"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              {t("description")}
            </label>
            <textarea
              name="description"
              rows={3}
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-300"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Storage Path *
              </label>
              <input
                name="file_path"
                required
                placeholder="{school_id}/{item_id}/file.pdf"
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                File Name *
              </label>
              <input
                name="file_name"
                required
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                {t("fileSize")} (bytes) *
              </label>
              <input
                name="file_size"
                type="number"
                required
                min={1}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-300"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                {t("format")} *
              </label>
              <select
                name="file_type"
                required
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-300"
              >
                <option value="pdf">PDF</option>
                <option value="epub">EPUB</option>
                <option value="audio">{t("audio")}</option>
                <option value="image">{t("image")}</option>
                <option value="document">{t("document")}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                {t("selectCategory")}
              </label>
              <select
                name="category_id"
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-300"
              >
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameTg}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                {t("visibility")}
              </label>
              <select
                name="visibility"
                defaultValue="all"
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-300"
              >
                <option value="all">{t("visibilityAll")}</option>
                <option value="teachers">{t("visibilityTeachers")}</option>
                <option value="admin">{t("visibilityAdmin")}</option>
                <option value="specific">{t("visibilitySpecific")}</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                {t("language")}
              </label>
              <select
                name="language"
                defaultValue="tg"
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-300"
              >
                <option value="tg">Тоҷикӣ</option>
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                {t("year")}
              </label>
              <input
                name="publication_year"
                type="number"
                min={1900}
                max={2100}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                {t("publisher")}
              </label>
              <input
                name="publisher"
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                {t("grade")}
              </label>
              <input
                name="grade_level"
                type="number"
                min={1}
                max={11}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-300"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              {t("uploadCover")} (Storage Path)
            </label>
            <input
              name="cover_path"
              placeholder="{school_id}/{item_id}/cover.jpg"
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-300"
            />
          </div>

          {(state as { error?: string } | null)?.error && (
            <p className="text-sm text-red-600">
              {String((state as { error?: string }).error)}
            </p>
          )}

          <Button type="submit" loading={isPending}>
            {t("addBook")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
