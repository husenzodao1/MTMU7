"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { ActionForm, SubmitButton, useFieldValue } from "@/components/ui/action-form";
import { TextField } from "@/components/ui/fields";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { useToast } from "@/components/ui/toast";
import { removeSocialAccountAction, saveSocialAccountAction } from "@/features/profile/social-actions";
import { accountLabel, platformName, SOCIAL_PLATFORMS, type SocialAccount, type SocialPlatform } from "@/lib/social/accounts";
import { cn } from "@/lib/utils/cn";

/**
 * One's accounts elsewhere, on one's own profile: those added, each with a
 * cross to take it off, and a row of the services' marks to add another — the
 * name (or the page's address, or for Telegram a number) is looked up on the
 * service before it is kept (social-actions.ts).
 */
export function SocialAccountsEditor({ accounts }: { accounts: SocialAccount[] }) {
  const t = useTranslations("portal.profile.accounts");
  return (
    <div className="space-y-4">
      {accounts.length > 0 ? (
        <ul className="social-own">
          {accounts.map((account) => (
            <OwnAccount key={account.platform} account={account} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">{t("none")}</p>
      )}
      <ActionForm action={saveSocialAccountAction} className="space-y-3" resetOnSuccess>
        <AddAccountFields />
        <SubmitButton size="sm">{t("add")}</SubmitButton>
      </ActionForm>
    </div>
  );
}

function AddAccountFields() {
  const t = useTranslations("portal.profile.accounts");
  const submitted = useFieldValue("platform");
  const [platform, setPlatform] = useState<SocialPlatform>((SOCIAL_PLATFORMS as readonly string[]).includes(submitted ?? "") ? (submitted as SocialPlatform) : "instagram");
  return (
    <>
      <div role="radiogroup" aria-label={t("service")} className="social-pick">
        {SOCIAL_PLATFORMS.map((key) => (
          <label key={key} className={cn("social-pick-item", key === platform && "social-pick-on")} data-platform={key} title={platformName(key)}>
            <input type="radio" name="platform" value={key} checked={key === platform} onChange={() => setPlatform(key)} className="sr-only" />
            <PlatformIcon platform={key} className="size-5" />
            <span className="sr-only">{platformName(key)}</span>
          </label>
        ))}
      </div>
      <TextField
        name="handle"
        label={platformName(platform)}
        hint={platform === "telegram" ? t("telegramHint") : t("handleHint")}
        placeholder={platform === "telegram" ? "@username / +992…" : "@username"}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={200}
        required
      />
    </>
  );
}

function OwnAccount({ account }: { account: SocialAccount }) {
  const t = useTranslations("portal.profile.accounts");
  const tRoot = useTranslations();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <li className="social-own-row" data-platform={account.platform}>
      <PlatformIcon platform={account.platform} className="social-link-mark" />
      <span className="min-w-0 flex-1">
        <span className="social-link-name">{platformName(account.platform)}</span>
        <span className="social-link-handle" dir="ltr">
          {accountLabel(account)}
        </span>
      </span>
      <button
        type="button"
        className="social-own-remove"
        aria-label={t("remove", { service: platformName(account.platform) })}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await removeSocialAccountAction(account.platform);
            if (result.message) toast(result.ok ? "success" : "danger", tRoot(result.message));
          })
        }
      >
        <X className="size-4" aria-hidden />
      </button>
    </li>
  );
}
