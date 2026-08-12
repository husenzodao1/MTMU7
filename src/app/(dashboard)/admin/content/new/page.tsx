"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { AdminNav } from "../../admin-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createPageAction } from "../actions";

export default function NewPagePage() {
  const t = useTranslations("admin");
  const [state, formAction, isPending] = useActionState(createPageAction, {
    error: null,
  });

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <h1 className="mb-6 text-2xl font-bold text-neutral-900">
          {t("createPage")}
        </h1>
        <Card className="max-w-xl">
          <CardContent className="pt-6">
            <form action={formAction} className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="slug"
                  className="text-sm font-medium text-neutral-700"
                >
                  Slug
                </label>
                <Input
                  id="slug"
                  name="slug"
                  placeholder="about-us"
                  required
                  pattern="[a-z0-9-]+"
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="titleTg"
                  className="text-sm font-medium text-neutral-700"
                >
                  {t("titleTg")}
                </label>
                <Input id="titleTg" name="titleTg" required />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="titleRu"
                  className="text-sm font-medium text-neutral-700"
                >
                  {t("titleRu")}
                </label>
                <Input id="titleRu" name="titleRu" />
              </div>
              {state.error && (
                <div className="animate-in rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {state.error}
                </div>
              )}
              <Button type="submit" loading={isPending}>
                {t("createPage")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
