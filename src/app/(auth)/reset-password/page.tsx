import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { NewPasswordForm, ResetRequestForm, VerifyCodeForm } from "@/features/auth/forms";
import { readResetEmail } from "@/features/auth/draft";
import { Card, CardBody } from "@/components/ui/surface";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.reset");
  return { title: t("title"), robots: { index: false } };
}

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = await getTranslations("auth.reset");
  const step = firstValue((await searchParams).step) ?? "email";

  let body: React.ReactNode;
  if (step === "verify") {
    const email = await readResetEmail();
    if (!email) redirect("/reset-password");
    body = (
      <>
        <h1 className="text-2xl font-semibold">{t("verifyTitle")}</h1>
        <p className="mb-5 mt-1 text-sm text-ink-secondary">{t("verifySubtitle", { email })}</p>
        <VerifyCodeForm purpose="reset" />
      </>
    );
  } else if (step === "password") {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims?.sub) redirect("/reset-password");
    body = (
      <>
        <h1 className="text-2xl font-semibold">{t("passwordTitle")}</h1>
        <p className="mb-5 mt-1 text-sm text-ink-secondary">{t("passwordSubtitle")}</p>
        <NewPasswordForm />
      </>
    );
  } else {
    body = (
      <>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mb-5 mt-1 text-sm text-ink-secondary">{t("subtitle")}</p>
        <ResetRequestForm />
      </>
    );
  }

  return (
    <Card as="div">
      <CardBody className="p-6 sm:p-8">
        {body}
        <p className="mt-5 border-t border-line pt-4 text-center text-sm">
          <Link href="/login" className="font-medium text-brand-700 hover:underline">
            {t("backToLogin")}
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
