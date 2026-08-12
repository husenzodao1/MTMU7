"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import type { UserWithRole } from "@/types/auth";

export function UserMenu({ user }: { user: UserWithRole }) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleLogout = () => {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    });
  };

  const primaryRole = user.roles[0];

  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-neutral-50">
      <Avatar
        src={user.avatarUrl}
        fallback={`${user.firstName[0]}${user.lastName[0]}`}
        size="sm"
      />
      <div className="hidden sm:block">
        <p className="text-sm font-medium text-neutral-900">
          {user.firstName} {user.lastName}
        </p>
        {primaryRole && (
          <p className="text-xs text-neutral-500">{primaryRole.nameTg}</p>
        )}
      </div>
      <button
        onClick={handleLogout}
        disabled={isPending}
        className="ml-1 rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
        aria-label={t("auth.logout")}
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
