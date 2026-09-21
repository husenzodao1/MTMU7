import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SignInForm } from "@/features/auth/forms";
import { Alert, Card, CardBody } from "@/components/ui/surface";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { safeRedirectPath } from "@/lib/security/redirect";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("title"), robots: { index: false } };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = await getTranslations("auth.login");
  const params = await searchParams;
  const reason = firstValue(params.reason);
  const nextRaw = firstValue(params.next);
  const next = nextRaw ? safeRedirectPath(nextRaw) : undefined;

  return (
    <Card as="div">
      <CardBody className="space-y-5 p-6 sm:p-8">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-ink-secondary">{t("subtitle")}</p>
        </div>
        {reason === "inactive" ? <Alert tone="warning">{t("inactive")}</Alert> : null}
        {reason === "password-updated" ? <Alert tone="success">{t("passwordUpdated")}</Alert> : null}
        {reason === "link-invalid" ? <Alert tone="warning">{t("linkInvalid")}</Alert> : null}
        <SignInForm next={next} />
        <p className="border-t border-line pt-4 text-center text-sm text-ink-secondary">
          {t("noAccount")}{" "}
          <Link href="/register" className="font-medium text-brand-text hover:underline">
            {t("register")}
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
