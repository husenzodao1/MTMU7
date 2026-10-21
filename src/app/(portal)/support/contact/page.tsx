import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, CardBody } from "@/components/ui/surface";
import { SupportContacts } from "@/features/support/contacts";
import { GuestSupportForm } from "@/features/support/guest-form";
import { SupportMark } from "@/features/support/support-mark";
import { requireAccess } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { WhatsAppIcon } from "@/components/site/social-icons";
import Link from "next/link";

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
  const access = await requireAccess();
  const t = await getTranslations("common.support");
  const supabase = await createClient();
  // The pupil's own requests to reach a girl of another class (00101), with
  // the school's answer; none where the table is not there yet.
  const { data: requests } = await supabase
    .from("contact_permissions")
    .select("id, status, created_at, target_id, target:users!contact_permissions_target_id_fkey(first_name, last_name)")
    .eq("requester_id", access.userId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (
    <Card as="div" className="mx-auto max-w-lg">
      <CardBody className="space-y-5 p-6 sm:p-8">
        <div className="text-center">
          <SupportMark className="mx-auto mb-2" />
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-ink-secondary">{t("subtitle")}</p>
        </div>
        {(requests ?? []).length > 0 ? (
          <section aria-labelledby="my-requests" className="support-requests">
            <h2 id="my-requests" className="support-requests-title">
              {t("requestsTitle")}
            </h2>
            <ul>
              {(requests ?? []).map((request) => {
                const target = request.target as unknown as { first_name: string; last_name: string } | null;
                const name = target ? `${target.first_name} ${target.last_name}` : "—";
                const status = request.status === "approved" || request.status === "declined" ? request.status : "pending";
                return (
                  <li key={request.id} className="support-request" data-status={status}>
                    <span className="support-request-mark" aria-hidden>
                      <WhatsAppIcon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{t("requestTo", { name })}</span>
                      {status === "approved" ? (
                        <Link href={`/profile/${request.target_id}`} className="text-xs font-medium text-brand-text hover:underline">
                          {t("openProfile")}
                        </Link>
                      ) : null}
                    </span>
                    <span className="support-request-state">{t(status)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
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
