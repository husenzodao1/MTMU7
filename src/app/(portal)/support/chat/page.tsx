import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { loadThread } from "@/features/messages/load-thread";
import { Thread } from "@/features/messages/thread";
import { Alert } from "@/components/ui/surface";
import { getPortalSession } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portal.messages");
  return { title: t("supportTitle"), robots: { index: false } };
}

/**
 * The signed-in person's conversation with the school's desk.
 *
 * Open to everybody with an account, whether or not their role includes
 * messaging: the one person who most needs to ask how the portal works is the
 * one who cannot find the messages page. Somebody whose account is not ready
 * yet is sent to the public page, which takes a note instead.
 */
export default async function SupportChatPage() {
  const session = await getPortalSession();
  if (session.stage === "email_unconfirmed") redirect("/confirm-email");
  if (session.stage !== "member" || !session.access) redirect("/support");
  const access = session.access;

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("open_support_conversation");
  if (error || !id) {
    const t = await getTranslations("errors");
    return <Alert tone="danger">{t("unexpected")}</Alert>;
  }
  const thread = await loadThread(access, id);
  if (!thread) notFound();

  return (
    <div className="-mx-1 h-[calc(100dvh-11rem-var(--strip-h))] min-h-[26rem] max-w-3xl overflow-hidden rounded-2xl border border-line bg-surface shadow-sm sm:mx-auto lg:h-[calc(100dvh-7.5rem-var(--strip-h))]">
      <Thread key={id} {...thread} />
    </div>
  );
}
