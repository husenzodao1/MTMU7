import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import { TwoFactorForm } from "@/features/auth/forms";
import { getAuthUserId, isSecondStepOwed } from "@/lib/auth/access";
import { safeRedirectPath } from "@/lib/security/redirect";

export const metadata: Metadata = { robots: { index: false } };

/**
 * The second step, after the password. Only somebody who owes it lands here:
 * signed out goes to sign-in, already through goes on.
 */
export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (!(await isSecondStepOwed())) {
    redirect((await getAuthUserId()) ? safeRedirectPath(next, "/dashboard") : "/login");
  }
  const t = await getTranslations("auth.twoFactor");
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
      <div className="mb-6 text-center">
        <span className="mx-auto mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-text-strong">
          <ShieldCheck className="size-7" aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">{t("subtitle")}</p>
      </div>
      <TwoFactorForm next={next ? safeRedirectPath(next, "/dashboard") : undefined} />
    </div>
  );
}
