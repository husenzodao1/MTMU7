"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/surface";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");
  useEffect(() => {
    console.error("[route-error]", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="px-4 py-10">
      <Card as="div" className="mx-auto max-w-xl">
        <EmptyState
          title={t("error.title")}
          description={t("error.description")}
          action={
            <div className="flex flex-col items-center gap-2">
              <Button onClick={reset}>{t("retry")}</Button>
              {error.digest ? <p className="text-xs text-ink-muted tabular">ID: {error.digest}</p> : null}
            </div>
          }
        />
      </Card>
    </div>
  );
}
