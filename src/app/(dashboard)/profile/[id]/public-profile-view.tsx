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
  UserX,
} from "lucide-react";
import { useActionState } from "react";
import { sendFriendRequest, cancelFriendRequest, removeFriend, acceptFriendRequest } from "../../friends/actions";
import { startDirectMessage } from "../../friends/actions";

export function PublicProfileView({
  profile,
  currentUserId,
}: {
  profile: PublicProfile;
  currentUserId: string;
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
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <Avatar
              src={profile.avatarUrl}
              fallback={`${profile.firstName[0]}${profile.lastName[0]}`}
              size="xl"
              className="h-24 w-24 text-2xl"
            />
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-xl font-bold text-neutral-900">
                {profile.lastName} {profile.firstName}
                {profile.middleName ? ` ${profile.middleName}` : ""}
              </h2>
              <div className="mt-1 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                {profile.roles.map((role) => (
                  <Badge key={role.slug} variant="secondary">
                    {role.slug === "student" && <GraduationCap className="mr-1 h-3 w-3" />}
                    {role.slug === "teacher" && <BookOpen className="mr-1 h-3 w-3" />}
                    {getRoleName(role)}
                  </Badge>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                {friendStatus === "none" && (
                  <form action={sendAction}>
                    <Button type="submit" size="sm" loading={sendPending}>
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
                    <Button type="submit" size="sm" loading={acceptPending}>
                      <UserCheck className="mr-1.5 h-4 w-4" />
                      {tf("acceptRequest")}
                    </Button>
                  </form>
                )}
                {friendStatus === "accepted" && (
                  <form action={removeAction}>
                    <Button type="submit" variant="outline" size="sm" loading={removePending}>
                      <UserCheck className="mr-1.5 h-4 w-4 text-success-600" />
                      {tf("friends")}
                    </Button>
                  </form>
                )}

                <form action={async () => { await startDirectMessage(profile.id); }}>
                  <Button type="submit" variant="outline" size="sm">
                    <MessageSquare className="mr-1.5 h-4 w-4" />
                    {tf("sendMessage")}
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isStudent && profile.className && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" /> {t("class")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="default" className="text-sm">{profile.className}</Badge>
          </CardContent>
        </Card>
      )}

      {isTeacher && profile.subjects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" /> {t("subjects")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {profile.subjects.map((s) => (
                <Badge key={s.nameTg} variant="secondary">
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
