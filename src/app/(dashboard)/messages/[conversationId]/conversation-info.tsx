"use client";

import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, LogOut, UserMinus } from "lucide-react";
import { leaveConversationAction, removeMemberAction } from "./actions";

interface Member {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: string;
}

export function ConversationInfo({
  conversationId,
  conversationName,
  conversationType,
  members,
  canManage,
  onClose,
}: {
  conversationId: string;
  conversationName: string;
  conversationType: string;
  members: Member[];
  canManage: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("messages");

  return (
    <div className="w-72 border-l border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-neutral-900">
          {t("conversationInfo")}
        </h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4">
        <div className="mb-4 text-center">
          <Avatar
            fallback={conversationName.slice(0, 2)}
            size="xl"
            className="mx-auto mb-2"
          />
          <h4 className="font-semibold text-neutral-900">{conversationName}</h4>
          <Badge variant="secondary" className="mt-1">
            {t(conversationType as "direct" | "group" | "classGroup" | "announcement")}
          </Badge>
        </div>

        <div className="space-y-1">
          <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            {t("members")} ({members.length})
          </h5>
          {members.map((member) => (
            <div
              key={member.userId}
              className="flex items-center gap-2 rounded-lg p-2 transition-colors duration-[var(--duration-fast)] hover:bg-neutral-50"
            >
              <Avatar
                fallback={`${member.firstName.charAt(0)}${member.lastName.charAt(0)}`}
                src={member.avatarUrl}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-800">
                  {member.firstName} {member.lastName}
                </p>
                {member.role === "admin" && (
                  <Badge variant="secondary" className="text-[10px]">
                    admin
                  </Badge>
                )}
              </div>
              {canManage && member.role !== "admin" && (
                <form
                  action={removeMemberAction.bind(
                    null,
                    conversationId,
                    member.userId
                  )}
                >
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <UserMinus className="h-3 w-3 text-red-400" />
                  </Button>
                </form>
              )}
            </div>
          ))}
        </div>

        {conversationType !== "direct" && (
          <form
            action={leaveConversationAction.bind(null, conversationId)}
            className="mt-6"
          >
            <Button
              type="submit"
              variant="outline"
              className="w-full text-red-500"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t("leaveConversation")}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
