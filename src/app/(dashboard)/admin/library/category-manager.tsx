"use client";

import { useState, useActionState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Pencil, Trash2, ChevronRight, FolderOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
} from "./actions";
import type { AdminCategory } from "./actions";

interface CategoryManagerProps {
  categories: AdminCategory[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function CategoryForm({
  onCancel,
  parentOptions,
  editingCategory,
}: {
  onCancel: () => void;
  parentOptions: AdminCategory[];
  editingCategory?: AdminCategory;
}) {
  const t = useTranslations("library");
  const [nameTg, setNameTg] = useState(editingCategory?.nameTg ?? "");
  const [slug, setSlug] = useState(editingCategory?.slug ?? "");

  const action = editingCategory
    ? updateCategoryAction.bind(null, editingCategory.id)
    : createCategoryAction;

  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">
            {t("categoryName")} (TJ) *
          </label>
          <input
            name="name_tg"
            value={nameTg}
            onChange={(e) => {
              setNameTg(e.target.value);
              if (!editingCategory) setSlug(slugify(e.target.value));
            }}
            required
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-300"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">
            {t("categoryName")} (RU)
          </label>
          <input
            name="name_ru"
            defaultValue={editingCategory?.nameRu ?? ""}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-300"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">
            Slug *
          </label>
          <input
            name="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-300"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">
            {t("parentCategory")}
          </label>
          <select
            name="parent_id"
            defaultValue={editingCategory?.parentId ?? ""}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-300"
          >
            <option value="">—</option>
            {parentOptions
              .filter((c) => c.id !== editingCategory?.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameTg}
                </option>
              ))}
          </select>
        </div>
      </div>

      {(state as { error?: string } | null)?.error && (
        <p className="text-sm text-red-600">
          {String((state as { error?: string }).error)}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={isPending}>
          {editingCategory ? t("editCategory") : t("addCategory")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t("clearFilters")}
        </Button>
      </div>
    </form>
  );
}

export function CategoryManager({ categories }: CategoryManagerProps) {
  const t = useTranslations("library");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const topLevel = categories.filter((c) => !c.parentId);
  const childrenOf = (parentId: string) =>
    categories.filter((c) => c.parentId === parentId);

  function renderCategory(cat: AdminCategory, depth: number) {
    const children = childrenOf(cat.id);
    const isEditing = editingId === cat.id;

    return (
      <div key={cat.id}>
        {isEditing ? (
          <CategoryForm
            onCancel={() => setEditingId(null)}
            parentOptions={categories}
            editingCategory={cat}
          />
        ) : (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-neutral-50"
            style={{ paddingLeft: `${depth * 24 + 12}px` }}
          >
            {children.length > 0 && (
              <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />
            )}
            <span className="flex-1 text-sm font-medium text-neutral-800">
              {cat.nameTg}
            </span>
            {cat.nameRu && (
              <span className="text-xs text-neutral-400">{cat.nameRu}</span>
            )}
            <Badge variant="secondary" className="text-[10px]">
              {cat.slug}
            </Badge>
            <button
              type="button"
              onClick={() => setEditingId(cat.id)}
              className="rounded p-1 text-neutral-400 hover:text-neutral-600"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <form action={deleteCategoryAction.bind(null, cat.id)}>
              <button
                type="submit"
                className="rounded p-1 text-neutral-400 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        )}
        {children.map((child) => renderCategory(child, depth + 1))}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          {t("manageCategories")}
        </CardTitle>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            {t("addCategory")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <CategoryForm
            onCancel={() => setShowForm(false)}
            parentOptions={categories}
          />
        )}

        {categories.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="h-10 w-10" />}
            title={t("noCategories")}
          />
        ) : (
          <div className="divide-y divide-neutral-100">
            {topLevel.map((cat) => renderCategory(cat, 0))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
