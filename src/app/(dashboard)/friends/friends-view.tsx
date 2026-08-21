"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useActionState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import {
  Users,
  UserPlus,
  UserCheck,
  UserX,
  Clock,
  MessageSquare,
  Search,
} from "lucide-react";
import {
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  removeFriend,
  type FriendItem,
} from "./actions";

type Tab = "friends" | "incoming" | "outgoing";

export function FriendsView({
  friends,
  incoming,
  outgoing,
}: {
  friends: FriendItem[];
  incoming: FriendItem[];
  outgoing: FriendItem[];
}) {
  const t = useTranslations("friends");
  const [activeTab, setActiveTab] = useState<Tab>("friends");

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "friends", label: t("friends"), count: friends.length },
    { key: "incoming", label: t("incoming"), count: incoming.length },
    { key: "outgoing", label: t("outgoing"), count: outgoing.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-primary-100 text-primary-700"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                  activeTab === tab.key ? "bg-primary-200" : "bg-neutral-200"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <Link href="/search">
          <Button variant="outline" size="sm">
            <Search className="mr-1.5 h-4 w-4" />
            {t("findPeople")}
          </Button>
        </Link>
      </div>

      {activeTab === "friends" && (
        <FriendsList items={friends} />
      )}
      {activeTab === "incoming" && (
        <IncomingList items={incoming} />
      )}
      {activeTab === "outgoing" && (
        <OutgoingList items={outgoing} />
      )}
    </div>
  );
}

function FriendsList({ items }: { items: FriendItem[] }) {
  const t = useTranslations("friends");

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-12 w-12" />}
        title={t("noFriends")}
        description={t("noFriendsDesc")}
      />
    );
  }

  return (
    <div className="space-y-2">
      {items.map((friend) => (
        <FriendCard key={friend.id} friend={friend} type="friend" />
      ))}
    </div>
  );
}

function IncomingList({ items }: { items: FriendItem[] }) {
  const t = useTranslations("friends");

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<UserPlus className="h-12 w-12" />}
        title={t("noIncoming")}
        description={t("noIncomingDesc")}
      />
    );
  }

  return (
    <div className="space-y-2">
      {items.map((friend) => (
        <FriendCard key={friend.id} friend={friend} type="incoming" />
      ))}
    </div>
  );
}

function OutgoingList({ items }: { items: FriendItem[] }) {
  const t = useTranslations("friends");

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Clock className="h-12 w-12" />}
        title={t("noOutgoing")}
        description={t("noOutgoingDesc")}
      />
    );
  }

  return (
    <div className="space-y-2">
      {items.map((friend) => (
        <FriendCard key={friend.id} friend={friend} type="outgoing" />
      ))}
    </div>
  );
}

function FriendCard({ friend, type }: { friend: FriendItem; type: "friend" | "incoming" | "outgoing" }) {
  const t = useTranslations("friends");

  const [acceptResult, acceptAction, acceptPending] = useActionState(
    () => acceptFriendRequest(friend.id),
    null
  );
  const [rejectResult, rejectAction, rejectPending] = useActionState(
    () => rejectFriendRequest(friend.id),
    null
  );
  const [cancelResult, cancelAction, cancelPending] = useActionState(
    () => cancelFriendRequest(friend.id),
    null
  );
  const [removeResult, removeAction, removePending] = useActionState(
    () => removeFriend(friend.id),
    null
  );

  const isHandled = acceptResult || rejectResult || cancelResult || removeResult;
  if (isHandled) return null;

  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3">
        <Link href={`/profile/${friend.id}`}>
          <Avatar
            src={friend.avatarUrl}
            fallback={`${friend.firstName[0]}${friend.lastName[0]}`}
            size="lg"
            className="cursor-pointer"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/profile/${friend.id}`} className="hover:underline">
            <p className="truncate font-medium text-neutral-800">
              {friend.lastName} {friend.firstName}
            </p>
          </Link>
          <p className="truncate text-xs text-neutral-500">{friend.roleName}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {type === "incoming" && (
            <>
              <form action={acceptAction}>
                <Button type="submit" size="sm" loading={acceptPending}>
                  <UserCheck className="mr-1 h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t("accept")}</span>
                </Button>
              </form>
              <form action={rejectAction}>
                <Button type="submit" variant="outline" size="sm" loading={rejectPending}>
                  <UserX className="mr-1 h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t("reject")}</span>
                </Button>
              </form>
            </>
          )}
          {type === "outgoing" && (
            <form action={cancelAction}>
              <Button type="submit" variant="outline" size="sm" loading={cancelPending}>
                {t("cancel")}
              </Button>
            </form>
          )}
          {type === "friend" && (
            <>
              <Link href={`/profile/${friend.id}`}>
                <Button variant="outline" size="sm">
                  <MessageSquare className="h-3.5 w-3.5" />
                </Button>
              </Link>
              <form action={removeAction}>
                <Button type="submit" variant="ghost" size="sm" loading={removePending}>
                  <UserX className="h-3.5 w-3.5 text-neutral-400" />
                </Button>
              </form>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
