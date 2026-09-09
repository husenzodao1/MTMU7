"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createArticleAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Save, Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function CreateArticleForm() {
  const t = useTranslations();
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createArticleAction, {
    error: null,
    success: false,
  });
  const statusRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.success && state.id) {
      router.push(`/news/${state.id}`);
    }
  }, [state.success, state.id, router]);

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">
              {t("news.articleTitle")} *
            </label>
            <Input name="title" required maxLength={500} placeholder={t("news.articleTitle")} />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">
              {t("news.coverImage")}
            </label>
            <Input name="coverImageUrl" type="url" placeholder="https://..." />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">
              {t("news.articleContent")} *
            </label>
            <textarea
              name="content"
              required
              rows={10}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder={t("news.articleContent")}
            />
          </div>

          <input ref={statusRef} type="hidden" name="status" value="draft" />

          {state.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
          )}

          {/* Mobile-friendly button row */}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/news">
              <Button type="button" variant="ghost" size="sm" className="w-full sm:w-auto gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                {t("common.back")}
              </Button>
            </Link>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => {
                  if (statusRef.current) statusRef.current.value = "draft";
                }}
                className="w-full sm:w-auto gap-1.5"
              >
                <Save className="h-4 w-4" />
                {t("news.saveDraft")}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPending}
                onClick={() => {
                  if (statusRef.current) statusRef.current.value = "submitted";
                }}
                className="w-full sm:w-auto gap-1.5"
              >
                <Send className="h-4 w-4" />
                {t("news.submitForReview")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
