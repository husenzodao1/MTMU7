import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MessageSquare } from "lucide-react";
import { respondFriendRequestAction, sendFriendRequestAction } from "@/features/profile/actions";
import { StartConversationButton } from "@/features/messages/start-conversation";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Avatar } from "@/components/ui/misc";
import { Breadcrumb, Card, CardBody, PageHeader } from "@/components/ui/surface";
import { can, hasModule } from "@/lib/auth/access";
import { requireAccess } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { robots: { index: false } };

export default async function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireAccess();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  if (id === access.userId) redirect("/profile");
  const t = await getTranslations("portal.friends");
  const supabase = await createClient();

  // RLS: active members of the same school only.
  const { data: person } = await supabase
    .from("users")
    .select("id, first_name, last_name, middle_name, avatar_url, school_id")
    .eq("id", id)
    .eq("school_id", access.school!.id)
    .maybeSingle();
  if (!person) notFound();

  const { data: relation } = await supabase
    .from("friend_requests")
    .select("id, sender_id, status")
    .in("status", ["pending", "accepted"])
    .or(`and(sender_id.eq.${access.userId},receiver_id.eq.${id}),and(sender_id.eq.${id},receiver_id.eq.${access.userId})`)
    .maybeSingle();

  const name = [person.last_name, person.first_name, person.middle_name].filter(Boolean).join(" ");
  const friendsEnabled = hasModule(access, "friends");

  return (
    <>
      <PageHeader breadcrumb={<Breadcrumb label={t("breadcrumb")} items={[{ label: t("title"), href: "/friends" }, { label: name }]} />} title={name} />
      <Card className="max-w-xl">
        <CardBody className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-start">
          <Avatar name={`${person.first_name} ${person.last_name}`} src={person.avatar_url} size="lg" className="size-20 text-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-ink">{name}</p>
            <p className="text-sm text-ink-muted">{access.school!.shortName}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              {hasModule(access, "messages") && can(access, "messages.use") ? (
                <StartConversationButton userId={person.id} label={t("message")} icon={<MessageSquare aria-hidden />} />
              ) : null}
              {friendsEnabled && !relation ? (
                <ActionForm action={sendFriendRequestAction}>
                  <input type="hidden" name="userId" value={person.id} />
                  <SubmitButton variant="secondary">{t("add")}</SubmitButton>
                </ActionForm>
              ) : null}
              {friendsEnabled && relation?.status === "pending" && relation.sender_id !== access.userId ? (
                <ActionForm action={respondFriendRequestAction}>
                  <input type="hidden" name="requestId" value={relation.id} />
                  <input type="hidden" name="decision" value="accept" />
                  <SubmitButton variant="secondary">{t("accept")}</SubmitButton>
                </ActionForm>
              ) : null}
              {friendsEnabled && relation?.status === "pending" && relation.sender_id === access.userId ? (
                <span className="self-center text-sm text-ink-muted">{t("requestPending")}</span>
              ) : null}
              {friendsEnabled && relation?.status === "accepted" ? <span className="self-center text-sm text-ink-muted">{t("connected")}</span> : null}
            </div>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
