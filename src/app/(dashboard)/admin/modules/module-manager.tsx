"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toggleModuleAction, toggleRoleVisibilityAction } from "./actions";
import { cn } from "@/lib/utils";

interface Module {
  id: string;
  slug: string;
  nameTg: string;
  nameRu: string | null;
  icon: string;
  isSystem: boolean;
  isEnabled: boolean;
}

interface Role {
  id: string;
  slug: string;
  nameTg: string;
  level: number;
}

interface RoleAccess {
  moduleId: string;
  roleId: string;
  isVisible: boolean;
}

interface ModuleManagerProps {
  modules: Module[];
  roles: Role[];
  roleAccess: RoleAccess[];
}

export function ModuleManager({
  modules,
  roles,
  roleAccess,
}: ModuleManagerProps) {
  const t = useTranslations("admin");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => (
          <ModuleCard key={mod.id} module={mod} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("roleVisibility")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="py-3 pr-4 text-left font-medium text-neutral-600">
                    {t("modules")}
                  </th>
                  {roles.map((role) => (
                    <th
                      key={role.id}
                      className="px-3 py-3 text-center font-medium text-neutral-600"
                    >
                      {role.nameTg}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules
                  .filter((m) => !m.isSystem)
                  .map((mod) => (
                    <tr key={mod.id} className="border-b border-neutral-100">
                      <td className="py-3 pr-4 font-medium text-neutral-800">
                        {mod.nameTg}
                        {!mod.isEnabled && (
                          <Badge variant="secondary" className="ml-2">
                            {t("moduleDisabled")}
                          </Badge>
                        )}
                      </td>
                      {roles.map((role) => {
                        const access = roleAccess.find(
                          (ra) =>
                            ra.moduleId === mod.id && ra.roleId === role.id
                        );
                        return (
                          <td key={role.id} className="px-3 py-3 text-center">
                            <RoleVisibilityToggle
                              moduleId={mod.id}
                              roleId={role.id}
                              visible={access?.isVisible ?? false}
                              disabled={!mod.isEnabled}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ModuleCard({ module: mod }: { module: Module }) {
  const t = useTranslations("admin");
  const [, formAction, isPending] = useActionState(toggleModuleAction, {
    error: null,
    success: false,
  });

  if (mod.isSystem) {
    return (
      <Card className="opacity-60">
        <CardContent className="flex items-center justify-between p-5">
          <div>
            <p className="font-medium text-neutral-800">{mod.nameTg}</p>
            <Badge variant="secondary" className="mt-1">
              {t("systemRole")}
            </Badge>
          </div>
          <Badge>{t("moduleEnabled")}</Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(!mod.isEnabled && "border-neutral-100 bg-neutral-50/50")}
    >
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="font-medium text-neutral-800">{mod.nameTg}</p>
        </div>
        <form action={formAction}>
          <input type="hidden" name="moduleId" value={mod.id} />
          <input
            type="hidden"
            name="enabled"
            value={(!mod.isEnabled).toString()}
          />
          <Button
            type="submit"
            variant={mod.isEnabled ? "outline" : "default"}
            size="sm"
            loading={isPending}
          >
            {mod.isEnabled ? t("disableModule") : t("enableModule")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function RoleVisibilityToggle({
  moduleId,
  roleId,
  visible,
  disabled,
}: {
  moduleId: string;
  roleId: string;
  visible: boolean;
  disabled: boolean;
}) {
  const [, formAction, isPending] = useActionState(
    toggleRoleVisibilityAction,
    { error: null, success: false }
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="moduleId" value={moduleId} />
      <input type="hidden" name="roleId" value={roleId} />
      <input type="hidden" name="visible" value={(!visible).toString()} />
      <button
        type="submit"
        disabled={disabled || isPending}
        className={cn(
          "h-6 w-6 rounded-md border transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)]",
          visible
            ? "border-primary-500 bg-primary-500 text-white"
            : "border-neutral-300 bg-white hover:border-neutral-400",
          disabled && "cursor-not-allowed opacity-40",
          isPending && "animate-pulse"
        )}
      >
        {visible && (
          <svg
            className="mx-auto h-4 w-4"
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
  );
}
