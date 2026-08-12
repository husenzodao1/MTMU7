"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { toggleUserActiveAction } from "./actions";
import Link from "next/link";
import { Users, Eye } from "lucide-react";

interface UserRow {
  id: string;
  publicId: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  roles: string[];
}

export function UsersTable({ users }: { users: UserRow[] }) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");

  if (users.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-12 w-12" />}
        title={tCommon("noData")}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50">
            <th className="px-4 py-3 text-left font-medium text-neutral-600">
              ID
            </th>
            <th className="px-4 py-3 text-left font-medium text-neutral-600">
              {t("userDetails")}
            </th>
            <th className="px-4 py-3 text-left font-medium text-neutral-600">
              {t("roles")}
            </th>
            <th className="px-4 py-3 text-left font-medium text-neutral-600">
              {t("userStatus")}
            </th>
            <th className="px-4 py-3 text-right font-medium text-neutral-600" />
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              key={user.id}
              className="border-b border-neutral-100 transition-colors duration-[var(--duration-fast)] hover:bg-neutral-50"
            >
              <td className="px-4 py-3 font-mono text-xs text-neutral-500">
                {user.publicId}
              </td>
              <td className="px-4 py-3">
                <p className="font-medium text-neutral-800">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-xs text-neutral-500">{user.email}</p>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {user.roles.map((role) => (
                    <Badge key={role} variant="secondary">
                      {role}
                    </Badge>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge variant={user.isActive ? "default" : "destructive"}>
                  {user.isActive ? t("activate") : t("deactivate")}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <form
                    action={toggleUserActiveAction.bind(
                      null,
                      user.id,
                      !user.isActive
                    )}
                  >
                    <Button type="submit" variant="ghost" size="sm">
                      {user.isActive ? t("deactivate") : t("activate")}
                    </Button>
                  </form>
                  <Link href={`/admin/users/${user.id}`}>
                    <Button variant="ghost" size="icon">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
