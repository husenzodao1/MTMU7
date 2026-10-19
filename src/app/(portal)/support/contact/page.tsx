import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Headset } from "lucide-react";
import { Card, CardBody } from "@/components/ui/surface";
import { SupportContacts } from "@/features/support/contacts";
import { GuestSupportForm } from "@/features/support/guest-form";
import { requireAccess } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.support");
  return { title: t("title"), robots: { index: false } };
}

/**
 * The support desk inside the portal, at the foot of the menu: the school on
 * WhatsApp, Telegram or the phone, or a note the desk answers by phone or
 * email (the same note a visitor leaves on /support).
 */
export default async function SupportContactPage() {
  await requireAccess();
  const t = await getTranslations("common.support");
  return (
    <Card as="div" className="mx-auto max-w-lg">
      <CardBody className="space-y-5 p-6 sm:p-8">
        <div className="text-center">
          <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full border border-line bg-surface-muted text-brand-text" aria-hidden>
            <Headset className="size-5" />
          </span>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-ink-secondary">{t("subtitle")}</p>
        </div>
        <SupportContacts />
        <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-ink-muted">
          <span className="h-px flex-1 bg-line" />
          {t("orLeaveNote")}
          <span className="h-px flex-1 bg-line" />
        </div>
        <GuestSupportForm />
      </CardBody>
    </Card>
  );
}
