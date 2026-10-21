import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LogIn } from "lucide-react";
import { Card, CardBody } from "@/components/ui/surface";
import { SupportContacts } from "@/features/support/contacts";
import { GuestSupportForm } from "@/features/support/guest-form";
import { SupportMark } from "@/features/support/support-mark";
import { getAccess } from "@/lib/auth/access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.support");
  return { title: t("title"), robots: { index: false } };
}

/**
 * The support desk, for somebody not signed in.
 *
 * Somebody with an account has the same desk inside the portal
 * (/support/contact). Everybody else — a parent who never received a login, a
 * teacher whose Google address was not recognised — can sign in, leave a note
 * the desk will answer by phone or email, or reach the school where it
 * already is.
 */
export default async function SupportPage() {
  const access = await getAccess();
  if (access && access.isActive && access.status === "active" && access.emailVerified) redirect("/support/contact");

  const t = await getTranslations("common.support");

  return (
    <Card as="div">
      <CardBody className="space-y-5 p-6 sm:p-8">
        <div className="text-center">
          <SupportMark className="mx-auto mb-2" />
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-ink-secondary">{t("subtitle")}</p>
        </div>

        <Link
          href="/login?next=%2Fsupport%2Fcontact"
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

        <SupportContacts className="border-t border-line pt-4" />
      </CardBody>
    </Card>
  );
}
