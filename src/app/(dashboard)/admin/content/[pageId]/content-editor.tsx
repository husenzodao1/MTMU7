"use client";

import { useState, useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  addBlockAction,
  deleteBlockAction,
  toggleBlockVisibilityAction,
} from "./actions";
import { Plus, Trash2, Eye, EyeOff, GripVertical, FileText } from "lucide-react";

interface ContentBlock {
  id: string;
  section: string;
  type: string;
  titleTg: string | null;
  bodyTg: string | null;
  imageUrl: string | null;
  isVisible: boolean;
  sortOrder: number;
}

interface ContentEditorProps {
  pageId: string;
  pageTitleTg: string;
  blocks: ContentBlock[];
}

export function ContentEditor({
  pageId,
  pageTitleTg,
  blocks,
}: ContentEditorProps) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const [showAddForm, setShowAddForm] = useState(false);

  const boundAddAction = addBlockAction.bind(null, pageId);
  const [addState, addFormAction, isAdding] = useActionState(boundAddAction, {
    error: null,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-800">
          {pageTitleTg}
        </h2>
        <Button
          onClick={() => setShowAddForm(!showAddForm)}
          variant={showAddForm ? "outline" : "default"}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("addBlock")}
        </Button>
      </div>

      {showAddForm && (
        <Card className="animate-in border-primary-200">
          <CardContent className="pt-6">
            <form
              action={async (fd) => {
                await addFormAction(fd);
                setShowAddForm(false);
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700">
                    {t("section")}
                  </label>
                  <Input
                    name="section"
                    placeholder="hero, about, info"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700">
                    {t("blockType")}
                  </label>
                  <select
                    name="type"
                    className="flex h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
                    required
                  >
                    <option value="text">Text</option>
                    <option value="image">Image</option>
                    <option value="html">HTML</option>
                    <option value="banner">Banner</option>
                    <option value="gallery">Gallery</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">
                  {t("titleTg")}
                </label>
                <Input name="titleTg" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">
                  {t("bodyTg")}
                </label>
                <textarea
                  name="bodyTg"
                  rows={4}
                  className="flex w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">
                  Image URL
                </label>
                <Input name="imageUrl" />
              </div>
              {addState.error && (
                <div className="animate-in rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {addState.error}
                </div>
              )}
              <Button type="submit" loading={isAdding}>
                {tCommon("save")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {blocks.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title={tCommon("noData")}
        />
      ) : (
        <div className="space-y-3">
          {blocks.map((block) => (
            <Card
              key={block.id}
              className={!block.isVisible ? "opacity-50" : ""}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <GripVertical className="h-5 w-5 cursor-grab text-neutral-300" />
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{block.type}</Badge>
                      <Badge variant="outline">{block.section}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-neutral-600">
                      {block.titleTg ?? block.bodyTg?.slice(0, 60) ?? "(empty)"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <form
                    action={async () => {
                      "use server";
                      await toggleBlockVisibilityAction(
                        pageId,
                        block.id,
                        !block.isVisible
                      );
                    }}
                  >
                    <Button type="submit" variant="ghost" size="icon">
                      {block.isVisible ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </Button>
                  </form>
                  <form
                    action={async () => {
                      "use server";
                      await deleteBlockAction(pageId, block.id);
                    }}
                  >
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      className="text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
