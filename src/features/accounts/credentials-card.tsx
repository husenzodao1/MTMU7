"use client";

import { Check, Copy, KeyRound, Printer, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { sendCredentialsAction } from "@/features/accounts/actions";

/**
 * A login and password, shown the one time they exist.
 *
 * Nothing stores the password, so this panel is the only copy: it can be
 * copied, printed as a slip to hand over, or — for a young pupil whose parents
 * follow them in the bot — sent straight to the parents' Telegram.
 */
export function CredentialsCard({
  name,
  login,
  password,
  offerTelegram,
}: {
  name: string;
  login: string;
  password: string;
  /** A pupil whose account their parents run. */
  offerTelegram: boolean;
}) {
  const t = useTranslations("accounts");
  const tRoot = useTranslations();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, startSending] = useTransition();

  const copy = () => {
    void navigator.clipboard?.writeText(`${t("login")}: ${login}\n${t("password")}: ${password}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const print = () => {
    // A slip of its own, not the page: the password and nothing else of the
    // portal goes to the printer.
    const slip = window.open("", "_blank", "width=480,height=360");
    if (!slip) return;
    const escape = (value: string) => value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    slip.document.write(`<!doctype html><meta charset="utf-8"><title>${escape(name)}</title>
      <body style="font-family:system-ui,sans-serif;padding:24px">
      <h2 style="margin:0 0 12px">${escape(name)}</h2>
      <p style="font-size:18px;margin:4px 0">${escape(t("login"))}: <b style="font-family:monospace">${escape(login)}</b></p>
      <p style="font-size:18px;margin:4px 0">${escape(t("password"))}: <b style="font-family:monospace">${escape(password)}</b></p>
      <p style="color:#555;margin-top:16px">${escape(location.origin)}/login</p>
      <script>window.onload=()=>{window.print();}</script></body>`);
    slip.document.close();
  };

  const send = () =>
    startSending(async () => {
      const result = await sendCredentialsAction([{ login, password }]);
      if (!result.ok) return void toast("danger", tRoot(result.message));
      if ((result.data?.messages ?? 0) > 0) setSent(true);
      toast(result.data?.messages ? "success" : "danger", t(result.data?.messages ? "telegramSent" : "telegramNobody"));
    });

  return (
    <div className="credentials-card overflow-hidden rounded-2xl border border-brand-300/60 bg-surface shadow-sm">
      <div className="flex items-center gap-3 bg-brand-50 px-4 py-3">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-brand-solid text-brand-on-solid">
          <KeyRound className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{t("credentialsTitle")}</p>
          <p className="text-xs text-ink-secondary">{t("credentialsBody")}</p>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 px-4 py-4 text-sm">
        <dt className="text-ink-muted">{t("login")}</dt>
        <dd className="font-mono text-base font-semibold tracking-wider text-ink">{login}</dd>
        <dt className="text-ink-muted">{t("password")}</dt>
        <dd className="font-mono text-base font-semibold tracking-wider text-ink">{password}</dd>
      </dl>
      <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
        <Button variant="secondary" size="sm" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? tRoot("common.copied") : t("copy")}
        </Button>
        <Button variant="secondary" size="sm" onClick={print}>
          <Printer aria-hidden />
          {t("print")}
        </Button>
        {offerTelegram ? (
          <Button variant={sent ? "secondary" : "primary"} size="sm" onClick={send} loading={sending} disabled={sent}>
            {sent ? <Check aria-hidden /> : <Send aria-hidden />}
            {sent ? t("telegramSent") : t("sendTelegram")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
