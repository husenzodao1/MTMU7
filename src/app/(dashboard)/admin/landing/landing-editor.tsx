"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateBlockAction } from "./actions";
import { Save } from "lucide-react";

interface LandingEditorProps {
  blocks: Array<Record<string, unknown>>;
}

function BlockEditor({ block }: { block: Record<string, unknown> }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [state, formAction, isPending] = useActionState(updateBlockAction, { error: null });

  const section = String(block.section);
  const hasBody = section !== "gallery";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(`section_${section}`)}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={String(block.id)} />

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">TG</label>
              <Input name="titleTg" defaultValue={String(block.title_tg ?? "")} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">RU</label>
              <Input name="titleRu" defaultValue={String(block.title_ru ?? "")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">EN</label>
              <Input name="titleEn" defaultValue={String(block.title_en ?? "")} />
            </div>
          </div>

          {hasBody && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-500">{t("bodyTg")}</label>
                <textarea
                  name="bodyTg"
                  defaultValue={String(block.body_tg ?? "")}
                  rows={4}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-500">{t("bodyRu")}</label>
                <textarea
                  name="bodyRu"
                  defaultValue={String(block.body_ru ?? "")}
                  rows={4}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-500">{t("bodyEn")}</label>
                <textarea
                  name="bodyEn"
                  defaultValue={String(block.body_en ?? "")}
                  rows={4}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                />
              </div>
            </div>
          )}

          {section === "hero" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">{t("heroImage")}</label>
              <Input name="imageUrl" defaultValue={String(block.image_url ?? "")} placeholder="https://..." />
            </div>
          )}

          {state.error && (
            <p className="text-sm text-error-600">{t(state.error)}</p>
          )}

          <Button type="submit" loading={isPending} className="press-scale">
            <Save className="mr-2 h-4 w-4" />
            {tc("save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function LandingEditor({ blocks }: LandingEditorProps) {
  return (
    <div className="space-y-6 animate-in">
      {blocks.map((block) => (
        <BlockEditor key={String(block.id)} block={block} />
      ))}
    </div>
  );
}
