"use client";

import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/ui/error-state";

export default function SettingsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  return (
    <div className="animate-in">
      <ErrorState
        title={t("generic")}
        description={t("genericDescription")}
        actions={[{ label: t("goHome"), onClick: reset }]}
      />
    </div>
  );
}
