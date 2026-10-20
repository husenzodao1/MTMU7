"use client";

import { Clock3, Lock, ShieldQuestion, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { WhatsAppIcon } from "@/components/site/social-icons";
import { useToast } from "@/components/ui/toast";
import { askContactPermissionAction, type ContactRequestStatus } from "@/features/people/contact-actions";

/**
 * A girl of another class, for a boy (00101): her WhatsApp is shut, with the
 * school's word on it and a way to ask the school. Asking tells the support
 * desk, and the request — with its answer when it comes — is on the support
 * page, where this takes the boy.
 */
function AskSheet({ userId, name, status, onClose }: { userId: string; name: string; status: ContactRequestStatus | null; onClose: () => void }) {
  const t = useTranslations("portal.people");
  const tRoot = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [now, setNow] = useState(status);

  const ask = () =>
    start(async () => {
      const result = await askContactPermissionAction(userId);
      if (!result.ok) {
        toast("danger", tRoot(result.message ?? "errors.unexpected"));
        return;
      }
      setNow(result.data ?? "pending");
      if (result.message) toast("success", tRoot(result.message));
      onClose();
      router.push("/support/contact");
    });

  return createPortal(
    <div className="contact-ask-layer" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="contact-ask-sheet" role="dialog" aria-modal="true" aria-labelledby="contact-ask-title">
        <button type="button" className="contact-ask-close" onClick={onClose} aria-label={tRoot("common.close")}>
          <X size={18} aria-hidden />
        </button>
        <span className="contact-ask-mark" aria-hidden>
          <WhatsAppIcon className="size-6" />
          <span className="contact-ask-lock">
            <Lock size={12} />
          </span>
        </span>
        <p id="contact-ask-title" className="contact-ask-title">
          {t("askTitle")}
        </p>
        <p className="contact-ask-text">{t("askText", { name })}</p>
        {now === "pending" ? (
          <p className="contact-ask-state">
            <Clock3 className="size-4" aria-hidden />
            {t("askPending")}
          </p>
        ) : now === "declined" ? (
          <p className="contact-ask-state contact-ask-declined">{t("askDeclined")}</p>
        ) : null}
        {now === "pending" ? (
          <button type="button" className="contact-ask-button contact-ask-quiet" onClick={() => router.push("/support/contact")}>
            {t("askSee")}
          </button>
        ) : (
          <button type="button" className="contact-ask-button" onClick={ask} disabled={pending} aria-busy={pending}>
            <ShieldQuestion className="size-4" aria-hidden />
            {t("askButton")}
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}

/** At the end of a person's row in search: the WhatsApp mark, shut. */
export function WhatsAppAskButton({ userId, name }: { userId: string; name: string }) {
  const t = useTranslations("portal.people");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="wa-button wa-button-shut" onClick={() => setOpen(true)} aria-label={t("askLocked", { name })} title={t("askTitle")}>
        <WhatsAppIcon className="size-[1.125rem]" />
        <span className="wa-button-lock" aria-hidden>
          <Lock size={9} />
        </span>
      </button>
      {open ? <AskSheet userId={userId} name={name} status={null} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** On a profile, where the WhatsApp box would be: shut, with the school's word and the way to ask. */
export function WhatsAppAskBox({ userId, name, status }: { userId: string; name: string; status: ContactRequestStatus | null }) {
  const t = useTranslations("portal.people");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="wa-box wa-box-shut" onClick={() => setOpen(true)}>
        <span className="wa-box-mark" aria-hidden>
          <WhatsAppIcon className="size-5" />
        </span>
        <span className="min-w-0 flex-1 text-start">
          <span className="block text-sm font-semibold text-ink">{t("askTitle")}</span>
          <span className="block text-xs text-ink-muted">{status === "pending" ? t("askPending") : status === "declined" ? t("askDeclined") : t("askButton")}</span>
        </span>
        <Lock className="size-4 shrink-0 text-ink-muted" aria-hidden />
      </button>
      {open ? <AskSheet userId={userId} name={name} status={status} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
