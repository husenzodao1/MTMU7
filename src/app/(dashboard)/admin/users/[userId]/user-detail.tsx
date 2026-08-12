"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { assignRoleAction, removeRoleAction } from "./actions";
import { Trash2 } from "lucide-react";

interface UserDetailData {
  id: string;
  publicId: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  email: string;
  phone: string | null;
  isActive: boolean;
  avatarUrl: string | null;
  assignedRoles: Array<{
    id: string;
    slug: string;
    nameTg: string;
    isSystem: boolean;
  }>;
}

interface AvailableRole {
  id: string;
  slug: string;
  nameTg: string;
}

export function UserDetail({
  user,
  availableRoles,
}: {
  user: UserDetailData;
  availableRoles: AvailableRole[];
}) {
  const t = useTranslations("admin");
  const [assignState, assignAction, isAssigning] = useActionState(
    assignRoleAction,
    { error: null, success: false }
  );

  const unassignedRoles = availableRoles.filter(
    (r) => !user.assignedRoles.some((ar) => ar.id === r.id)
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("userDetails")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-100 text-lg font-semibold text-primary-700">
              {user.firstName[0]}
              {user.lastName[0]}
            </div>
            <div>
              <p className="text-lg font-semibold text-neutral-900">
                {user.firstName} {user.lastName}{" "}
                {user.middleName ?? ""}
              </p>
              <p className="font-mono text-sm text-neutral-500">
                {user.publicId}
              </p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">Email</span>
              <span>{user.email}</span>
            </div>
            {user.phone && (
              <div className="flex justify-between">
                <span className="text-neutral-500">Phone</span>
                <span>{user.phone}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-neutral-500">{t("userStatus")}</span>
              <Badge variant={user.isActive ? "default" : "destructive"}>
                {user.isActive ? t("activate") : t("deactivate")}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("roles")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {user.assignedRoles.map((role) => (
              <div
                key={role.id}
                className="flex items-center justify-between rounded-lg border border-neutral-200 p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{role.nameTg}</span>
                  {role.isSystem && (
                    <Badge variant="secondary">{t("systemRole")}</Badge>
                  )}
                </div>
                {!role.isSystem && (
                  <form
                    action={async () => {
                      "use server";
                      await removeRoleAction(user.id, role.id);
                    }}
                  >
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      className="text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </form>
                )}
              </div>
            ))}
          </div>

          {unassignedRoles.length > 0 && (
            <form action={assignAction} className="flex items-end gap-3">
              <input type="hidden" name="userId" value={user.id} />
              <div className="flex-1 space-y-1">
                <label className="text-sm font-medium text-neutral-700">
                  {t("assignRole")}
                </label>
                <select
                  name="roleId"
                  className="flex h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
                  required
                >
                  {unassignedRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nameTg}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" loading={isAssigning}>
                {t("assignRole")}
              </Button>
            </form>
          )}
          {assignState.error && (
            <div className="animate-in rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {assignState.error}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
