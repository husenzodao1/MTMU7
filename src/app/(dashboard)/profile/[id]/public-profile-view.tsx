"use client";

import { useTranslations, useLocale } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import type { PublicProfile } from "../actions";
import {
  GraduationCap,
  BookOpen,
  UserPlus,
  UserCheck,
  Clock,
  MessageSquare,
} from "lucide-react";
import { useActionState } from "react";
import { sendFriendRequest, cancelFriendRequest, removeFriend, acceptFriendRequest } from "../../friends/actions";
import { createDirectConversation } from "../../messages/new/actions";

export function PublicProfileView({
  profile,
}: {
  profile: PublicProfile;
  currentUserId?: string;
}) {
  const t = useTranslations("profile");
  const tf = useTranslations("friends");
  const locale = useLocale();

  const [sendState, sendAction, sendPending] = useActionState(
    () => sendFriendRequest(profile.id),
    null
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    () => cancelFriendRequest(profile.id),
    null
  );
  const [acceptState, acceptAction, acceptPending] = useActionState(
    () => acceptFriendRequest(profile.id),
    null
  );
  const [removeState, removeAction, removePending] = useActionState(
    () => removeFriend(profile.id),
    null
  );

  const isTeacher = profile.roles.some((r) => r.slug === "teacher");
  const isStudent = profile.roles.some((r) => r.slug === "student");

  const getRoleName = (role: { slug: string; nameTg: string; nameRu: string | null }) => {
    if (locale === "ru" && role.nameRu) return role.nameRu;
    return role.nameTg;
  };

  const friendStatus = (sendState as { status?: string } | null)?.status
    ?? (cancelState as { status?: string } | null)?.status
    ?? (acceptState as { status?: string } | null)?.status
    ?? (removeState as { status?: string } | null)?.status
    ?? profile.friendStatus;

  return (
    <div className="space-y-6">
      {/* Profile Header Hero Capsule */}
      <div className="relative overflow-hidden rounded-[28px] border border-neutral-200/70 bg-gradient-to-br from-[#E8EEFB] via-[#EEF2FC] to-[#DBE7FC] p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <Avatar
            src={profile.avatarUrl}
            fallback={`${profile.firstName[0]}${profile.lastName[0]}`}
            size="2xl"
            className="h-24 w-24 ring-4 ring-white/90 shadow-md"
          />
          <div className="flex-1 text-center sm:text-left min-w-0">
            <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight">
              {profile.lastName} {profile.firstName}
              {profile.middleName ? ` ${profile.middleName}` : ""}
            </h2>

            <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
              {profile.roles.map((role) => (
                <Badge key={role.slug} variant="default" className="text-xs font-bold py-1">
                  {role.slug === "student" && <GraduationCap className="mr-1 h-3.5 w-3.5" />}
                  {role.slug === "teacher" && <BookOpen className="mr-1 h-3.5 w-3.5" />}
                  {getRoleName(role)}
                </Badge>
              ))}
              {profile.className && (
                <Badge variant="pill" className="text-xs font-bold py-1">
                  {profile.className}
                </Badge>
              )}
            </div>

            {/* Action Buttons */}
            <div className="mt-5 flex flex-wrap justify-center gap-2.5 sm:justify-start">
              {friendStatus === "none" && (
                <form action={sendAction}>
                  <Button type="submit" size="sm" variant="default" loading={sendPending}>
                    <UserPlus className="mr-1.5 h-4 w-4" />
                    {tf("addFriend")}
                  </Button>
                </form>
              )}
              {friendStatus === "pending_sent" && (
                <form action={cancelAction}>
                  <Button type="submit" variant="outline" size="sm" loading={cancelPending}>
                    <Clock className="mr-1.5 h-4 w-4" />
                    {tf("requestSent")}
                  </Button>
                </form>
              )}
              {friendStatus === "pending_received" && (
                <form action={acceptAction}>
                  <Button type="submit" size="sm" variant="default" loading={acceptPending}>
                    <UserCheck className="mr-1.5 h-4 w-4" />
                    {tf("acceptRequest")}
                  </Button>
                </form>
              )}
              {friendStatus === "accepted" && (
                <form action={removeAction}>
                  <Button type="submit" variant="outline" size="sm" loading={removePending}>
                    <UserCheck className="mr-1.5 h-4 w-4 text-emerald-600" />
                    {tf("friends")}
                  </Button>
                </form>
              )}

              <form action={async () => { await createDirectConversation(profile.id); }}>
                <Button type="submit" variant="outline" size="sm">
                  <MessageSquare className="mr-1.5 h-4 w-4" />
                  {tf("sendMessage")}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {isStudent && profile.className && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="h-4.5 w-4.5 text-primary-600" /> {t("class")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="default" className="text-sm font-bold">{profile.className}</Badge>
          </CardContent>
        </Card>
      )}

      {isTeacher && profile.subjects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4.5 w-4.5 text-primary-600" /> {t("subjects")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {profile.subjects.map((s) => (
                <Badge key={s.nameTg} variant="secondary" className="px-3 py-1">
                  {locale === "ru" && s.nameRu ? s.nameRu : s.nameTg}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
