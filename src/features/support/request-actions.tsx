"use client";

import { Check, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { resolveSupportRequestAction } from "@/features/support/admin-actions";

export function ResolveRequestButton({ id, done }: { id: string; done: boolean }) {
  const t = useTranslations();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={() =>
        start(async () => {
          const result = await resolveSupportRequestAction(id, !done);
          if (result.message) toast(result.ok ? "success" : "danger", t(result.message));
        })
      }
    >
      {done ? <RotateCcw aria-hidden /> : <Check aria-hidden />}
      {done ? t("admin.support.reopen") : t("admin.support.markDone")}
    </Button>
  );
}
