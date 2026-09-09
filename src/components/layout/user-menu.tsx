"use client";

import { useTransition } from "react";
import Link from "next/link";
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
    <div className="flex items-center gap-2 rounded-full border border-neutral-200/80 bg-white/90 p-1 pl-1.5 shadow-2xs transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)] hover:border-neutral-300">
      <Link href="/profile" className="flex items-center gap-2.5 group">
        <Avatar
          src={user.avatarUrl}
          fallback={`${user.firstName[0]}${user.lastName[0]}`}
          size="sm"
        />
        <div className="hidden xl:block text-left pr-1">
          <p className="text-xs font-bold text-neutral-900 tracking-tight group-hover:text-primary-600 transition-colors">
            {user.firstName} {user.lastName}
          </p>
          {primaryRole && (
            <p className="text-[10px] font-medium text-neutral-500">{primaryRole.nameTg}</p>
          )}
        </div>
      </Link>
      <button
        onClick={handleLogout}
        disabled={isPending}
        className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)] hover:bg-neutral-100 hover:text-neutral-900 press-scale cursor-pointer"
        aria-label={t("auth.logout")}
        title={t("auth.logout")}
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
