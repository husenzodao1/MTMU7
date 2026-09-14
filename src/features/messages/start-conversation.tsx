"use client";

import { useTranslations } from "next-intl";
import { useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { startDirectConversationAction } from "@/features/messages/actions";

export function StartConversationButton({ userId, label, icon }: { userId: string; label: string; icon?: ReactNode }) {
  const t = useTranslations();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await startDirectConversationAction(userId);
          if (result && !result.ok) toast("danger", t(result.message));
        })
      }
    >
      {pending ? null : icon}
      {label}
    </Button>
  );
}
