"use client";

import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * Opens the browser's print dialogue, which also produces a PDF. The print
 * stylesheet drops the navigation and forces light surfaces.
 */
export function PrintButton({ className }: { className?: string }) {
  const t = useTranslations("common");
  return (
    <Button type="button" variant="secondary" size="sm" className={className} onClick={() => window.print()}>
      <Printer aria-hidden />
      {t("print")}
    </Button>
  );
}
