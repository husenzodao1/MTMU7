"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createInvitationAction, deleteInvitationAction } from "./actions";
import { Copy, Trash2, Plus } from "lucide-react";
import { useState } from "react";

interface InvitationsListProps {
  invitations: Array<Record<string, unknown>>;
  roles: Array<Record<string, unknown>>;
}

export function InvitationsList({ invitations, roles }: InvitationsListProps) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [state, formAction, isPending] = useActionState(createInvitationAction, { error: null });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyCode = async (code: string, id: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6 animate-in">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            {t("createInvitation")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label htmlFor="roleId" className="text-sm font-medium text-neutral-700">
                {t("role")}
              </label>
              <select
                id="roleId"
                name="roleId"
                required
                className="flex h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
                {roles.map((role) => (
                  <option key={String(role.id)} value={String(role.id)}>
                    {String(role.name_tg)} ({String(role.slug)})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="maxUses" className="text-sm font-medium text-neutral-700">
                {t("maxUses")}
              </label>
              <Input id="maxUses" name="maxUses" type="number" defaultValue="1" min="1" max="1000" className="w-24" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="expiresInDays" className="text-sm font-medium text-neutral-700">
                {t("expiresInDays")}
              </label>
              <Input id="expiresInDays" name="expiresInDays" type="number" placeholder="30" min="1" max="365" className="w-24" />
            </div>
            <Button type="submit" loading={isPending}>
              {tc("create")}
            </Button>
          </form>
          {state.error && (
            <p className="mt-2 text-sm text-error-600">{t(state.error)}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("activeInvitations")}</CardTitle>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-sm text-neutral-500">{tc("noData")}</p>
          ) : (
            <div className="space-y-3">
              {invitations.map((inv, i) => {
                const role = inv.roles as Record<string, unknown> | null;
                const isExpired = inv.expires_at && new Date(String(inv.expires_at)) < new Date();
                const isFull = Number(inv.used_count) >= Number(inv.max_uses);
                return (
                  <div
                    key={String(inv.id)}
                    className="flex items-center justify-between rounded-lg border border-neutral-200 p-3 animate-list-item"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className="flex items-center gap-3">
                      <code className="rounded bg-neutral-100 px-2 py-1 text-sm font-mono font-bold text-neutral-800">
                        {String(inv.code)}
                      </code>
                      <Badge variant={isExpired || isFull ? "secondary" : "default"}>
                        {role ? String(role.name_tg) : "—"}
                      </Badge>
                      <span className="text-xs text-neutral-500">
                        {String(inv.used_count)}/{String(inv.max_uses)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyCode(String(inv.code), String(inv.id))}
                        className="press-scale"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <form action={deleteInvitationAction.bind(null, String(inv.id))}>
                        <Button variant="ghost" size="icon" className="text-error-600 press-scale">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
