import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ConfirmEmailForm } from "@/features/auth/forms";
import { readConfirmEmail } from "@/features/auth/draft";
import { getAccess } from "@/lib/auth/access";
import { Card, CardBody } from "@/components/ui/surface";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { safeRedirectPath } from "@/lib/security/redirect";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.confirm");
  return { title: t("title"), robots: { index: false } };
}

/**
 * The step between being handed a login and being inside. The address comes
 * from the session, or — where the project refuses an unconfirmed account a
 * session at all — from the httpOnly cookie the sign-in wrote. Never from the
 * query string: a code must not be redirectable to someone else's inbox.
 */
export default async function ConfirmEmailPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const nextRaw = firstValue(params.next);
  const next = nextRaw ? safeRedirectPath(nextRaw) : undefined;

  const access = await getAccess();
  if (access?.emailVerified) redirect(next ?? "/dashboard");

  const email = access?.email ?? (await readConfirmEmail());
  if (!email) redirect("/login");

  return (
    <Card as="div">
      <CardBody className="space-y-5 p-6 sm:p-8">
        <ConfirmEmailForm next={next} email={email} />
      </CardBody>
    </Card>
  );
}
