"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createDirectorAction } from "./actions";
import { Plus } from "lucide-react";

export function DirectorForm() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [state, formAction, isPending] = useActionState(createDirectorAction, { error: null });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          {t("addDirector")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">{t("nameTg")}</label>
              <Input name="fullNameTg" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">{t("nameRu")}</label>
              <Input name="fullNameRu" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">{t("nameEn")}</label>
              <Input name="fullNameEn" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">{t("positionTg")}</label>
              <Input name="positionTg" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">{t("positionRu")}</label>
              <Input name="positionRu" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">{t("positionEn")}</label>
              <Input name="positionEn" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">{t("yearStart")}</label>
              <Input name="yearStart" type="number" min="1900" max="2100" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">{t("yearEnd")}</label>
              <Input name="yearEnd" type="number" min="1900" max="2100" placeholder={t("currentDirector")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">{t("sortOrder")}</label>
              <Input name="sortOrder" type="number" defaultValue="0" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-500">{t("photoUrl")}</label>
            <Input name="photoUrl" placeholder="https://..." />
          </div>
          {state.error && (
            <p className="text-sm text-error-600">{t(state.error)}</p>
          )}
          <Button type="submit" loading={isPending} className="press-scale">
            {tc("create")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
