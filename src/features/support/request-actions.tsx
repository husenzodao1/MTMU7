"use client";

import { Check, RotateCcw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { resolveSupportRequestAction } from "@/features/support/admin-actions";
import { decideContactPermissionAction } from "@/features/people/contact-actions";

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

/** A pupil's request to reach a girl of another class (00101): yes or no. */
export function DecidePermissionButtons({ id }: { id: string }) {
  const t = useTranslations();
  const toast = useToast();
  const [pending, start] = useTransition();
  const decide = (approve: boolean) =>
    start(async () => {
      const result = await decideContactPermissionAction(id, approve);
      if (result.message) toast(result.ok ? "success" : "danger", t(result.message));
    });
  return (
    <div className="flex gap-2">
      <Button variant="secondary" size="sm" loading={pending} onClick={() => decide(false)}>
        <X aria-hidden />
        {t("admin.support.decline")}
      </Button>
      <Button size="sm" loading={pending} onClick={() => decide(true)}>
        <Check aria-hidden />
        {t("admin.support.approve")}
      </Button>
    </div>
  );
}
