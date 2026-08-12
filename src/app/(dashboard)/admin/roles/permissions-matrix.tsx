"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { togglePermissionAction } from "./actions";
import { cn } from "@/lib/utils";
import { Fragment } from "react";

interface Role {
  id: string;
  slug: string;
  nameTg: string;
  isSystem: boolean;
}

interface Permission {
  id: string;
  slug: string;
  module: string;
  action: string;
  nameTg: string;
}

interface RolePermission {
  roleId: string;
  permissionId: string;
}

interface PermissionsMatrixProps {
  roles: Role[];
  permissions: Permission[];
  rolePermissions: RolePermission[];
}

export function PermissionsMatrix({
  roles,
  permissions,
  rolePermissions,
}: PermissionsMatrixProps) {
  const t = useTranslations("admin");

  const modules = Array.from(new Set(permissions.map((p) => p.module)));

  const hasPermission = (roleId: string, permId: string) =>
    rolePermissions.some(
      (rp) => rp.roleId === roleId && rp.permissionId === permId
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("permissionsMatrix")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="py-3 pr-4 text-left font-medium text-neutral-600">
                  Permission
                </th>
                {roles.map((role) => (
                  <th
                    key={role.id}
                    className="px-2 py-3 text-center font-medium text-neutral-600"
                  >
                    <div>{role.nameTg}</div>
                    {role.isSystem && (
                      <Badge
                        variant="secondary"
                        className="mt-1 text-[10px]"
                      >
                        {t("systemRole")}
                      </Badge>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map((mod) => (
                <Fragment key={mod}>
                  <tr>
                    <td
                      colSpan={roles.length + 1}
                      className="bg-neutral-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500"
                    >
                      {mod}
                    </td>
                  </tr>
                  {permissions
                    .filter((p) => p.module === mod)
                    .map((perm) => (
                      <tr
                        key={perm.id}
                        className="border-b border-neutral-100"
                      >
                        <td className="py-2 pr-4 text-neutral-700">
                          {perm.nameTg}
                        </td>
                        {roles.map((role) => {
                          const checked = hasPermission(role.id, perm.id);
                          return (
                            <td
                              key={role.id}
                              className="px-2 py-2 text-center"
                            >
                              <form
                                action={async () => {
                                  "use server";
                                  await togglePermissionAction(
                                    role.id,
                                    perm.id,
                                    !checked
                                  );
                                }}
                              >
                                <button
                                  type="submit"
                                  className={cn(
                                    "h-5 w-5 rounded border transition-all duration-[var(--duration-fast)]",
                                    checked
                                      ? "border-primary-500 bg-primary-500"
                                      : "border-neutral-300 bg-white hover:border-neutral-400"
                                  )}
                                >
                                  {checked && (
                                    <svg
                                      className="mx-auto h-3 w-3 text-white"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      strokeWidth={3}
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M4.5 12.75l6 6 9-13.5"
                                      />
                                    </svg>
                                  )}
                                </button>
                              </form>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
