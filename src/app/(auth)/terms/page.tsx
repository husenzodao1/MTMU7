import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, CardBody } from "@/components/ui/surface";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.terms");
  return { title: t("title") };
}

const RULES = ["r1", "r2", "r3", "r4", "r5", "r6", "r7"] as const;

/**
 * The terms a person accepts by signing in: the school's own rules, as its
 * founding director set them, numbered and signed.
 */
export default async function TermsPage() {
  const t = await getTranslations("auth.terms");
  const rules = RULES.map((key) => t(`rules.${key}`));
  return (
    <Card as="article">
      <CardBody className="p-5 sm:p-7">
        <h1 className="text-center font-display text-base font-semibold text-ink">{t("heading")}</h1>
        <p className="mt-3 text-[0.8125rem] leading-6 text-ink-secondary">{t("intro")}</p>
        <ol className="terms-list mt-4">
          {rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
        <p className="mt-4 text-[0.8125rem] font-medium leading-6 text-ink">{t("closing")}</p>
        <p className="mt-5 border-t border-line pt-3 text-right text-xs text-ink-muted">
          {t("signature")}: <span className="font-semibold text-ink">{t("signatory")}</span>
        </p>
      </CardBody>
    </Card>
  );
}
