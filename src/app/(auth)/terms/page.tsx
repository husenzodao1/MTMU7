import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, CardBody, Alert } from "@/components/ui/surface";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.terms");
  return { title: t("title") };
}

/**
 * The terms a person accepts by signing in or registering. The text itself is
 * supplied by the portal owner; until then this states plainly that it is
 * outstanding rather than showing invented conditions.
 */
export default async function TermsPage() {
  const t = await getTranslations("auth.terms");
  return (
    <Card as="div">
      <CardBody className="space-y-4 p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Alert tone="warning">{t("pending")}</Alert>
      </CardBody>
    </Card>
  );
}
