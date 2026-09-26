import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Headset, LogIn, Phone } from "lucide-react";
import { TelegramIcon, WhatsAppIcon } from "@/components/site/social-icons";
import { Card, CardBody } from "@/components/ui/surface";
import { GuestSupportForm } from "@/features/support/guest-form";
import { getAccess } from "@/lib/auth/access";
import { getAuthSchool } from "@/lib/site/auth-school";
import { PLATFORM_PHONE, resolveContacts } from "@/lib/site/contacts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.support");
  return { title: t("title"), robots: { index: false } };
}

/**
 * Where the floating button lands.
 *
 * Somebody with an account goes straight into their conversation with the
 * desk. Everybody else — a parent who never received a login, a teacher whose
 * Google address was not recognised — can sign in, leave a note the desk will
 * answer by phone or email, or reach the school where it already is.
 */
export default async function SupportPage() {
  const access = await getAccess();
  if (access && access.isActive && access.status === "active" && access.emailVerified) redirect("/support/chat");

  const t = await getTranslations("common.support");
  const school = await getAuthSchool();
  const contacts = resolveContacts(school?.socialLinks);

  return (
    <Card as="div">
      <CardBody className="space-y-5 p-6 sm:p-8">
        <div className="text-center">
          <span className="support-fab relative mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-brand-solid text-brand-on-solid" aria-hidden>
            <Headset className="size-7" />
          </span>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-ink-secondary">{t("subtitle")}</p>
        </div>

        <Link
          href="/login?next=%2Fsupport%2Fchat"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-solid px-4 py-3 text-sm font-semibold text-brand-on-solid transition-colors hover:bg-brand-solid-hover"
        >
          <LogIn className="size-4" aria-hidden />
          {t("signInToChat")}
        </Link>

        <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-ink-muted">
          <span className="h-px flex-1 bg-line" />
          {t("orLeaveNote")}
          <span className="h-px flex-1 bg-line" />
        </div>

        <GuestSupportForm />

        <div className="grid grid-cols-3 gap-2 border-t border-line pt-4">
          <a href={contacts.whatsapp} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-xs font-medium text-ink-secondary hover:bg-surface-muted">
            <WhatsAppIcon className="size-5 text-[#25d366]" />
            WhatsApp
          </a>
          <a href={contacts.telegram} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-xs font-medium text-ink-secondary hover:bg-surface-muted">
            <TelegramIcon className="size-5 text-[#229ed9]" />
            Telegram
          </a>
          <a
            href={`tel:${(school?.phone ?? PLATFORM_PHONE).replace(/[^\d+]/g, "")}`}
            className="flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-xs font-medium text-ink-secondary hover:bg-surface-muted"
          >
            <Phone className="size-5 text-brand-text" aria-hidden />
            {t("call")}
          </a>
        </div>
      </CardBody>
    </Card>
  );
}
