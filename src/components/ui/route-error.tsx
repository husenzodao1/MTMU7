"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/surface";

/**
 * What a page shows when it fails to load: a short apology, "try again", and
 * a way home. In the portal and the admin centre it stands inside their own
 * frame, so the menu is still there to go somewhere else.
 */
export function RouteError({ error, reset, home }: { error: Error & { digest?: string }; reset: () => void; home?: string }) {
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
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={reset}>{t("retry")}</Button>
                {home ? (
                  <Link href={home} className={buttonClasses("secondary")}>
                    {t("error.home")}
                  </Link>
                ) : null}
              </div>
              {error.digest ? <p className="text-xs text-ink-muted tabular">ID: {error.digest}</p> : null}
            </div>
          }
        />
      </Card>
    </div>
  );
}
