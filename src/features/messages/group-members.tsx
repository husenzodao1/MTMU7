"use client";

import { UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { Avatar } from "@/components/ui/misc";
import * as Overlay from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { ContactPicker } from "@/features/messages/contact-picker";
import { addGroupMembersAction, removeGroupMemberAction, renameGroupAction } from "@/features/messages/actions";
import type { ContactResult, ConversationMember } from "@/features/messages/types";

export function GroupMembersDialog({
  open,
  onOpenChange,
  conversationId,
  title,
  members,
  currentUserId,
  isAdmin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  title: string;
  members: ConversationMember[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const t = useTranslations("portal.messages");
  const tRoot = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState(title);
  const [selected, setSelected] = useState<ContactResult[]>([]);
  const [pending, startTransition] = useTransition();

  const run = (task: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) => {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        toast("danger", tRoot(result.message ?? "errors.unexpected"));
        return;
      }
      if (result.message) toast("success", tRoot(result.message));
      after?.();
      router.refresh();
    });
  };

  return (
    <Overlay.Dialog open={open} onOpenChange={onOpenChange}>
      <Overlay.DialogContent title={t("members")} description={t("memberCount", { count: members.length })} closeLabel={tRoot("common.close")}>
        {isAdmin ? (
          <form
            className="mb-5 flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => renameGroupAction(conversationId, name));
            }}
          >
            <div className="flex-1">
              <label htmlFor="rename-group" className="mb-1.5 block text-sm font-medium text-ink">{t("groupName")}</label>
              <Input id="rename-group" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
            </div>
            <Button type="submit" variant="secondary" disabled={pending || !name.trim() || name.trim() === title}>
              {tRoot("common.save")}
            </Button>
          </form>
        ) : null}

        <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-md border border-line">
          {members.map((member) => {
            const memberName = `${member.last_name ?? ""} ${member.first_name ?? ""}`.trim() || t("unknownUser");
            return (
              <li key={member.user_id} className="flex items-center gap-3 px-3 py-2">
                <Avatar name={memberName} src={member.avatar_url} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {memberName}
                  {member.user_id === currentUserId ? <span className="text-ink-muted"> ({t("you")})</span> : null}
                </span>
                {member.role === "admin" ? <Badge tone="brand">{t("groupAdmin")}</Badge> : null}
                {isAdmin && member.user_id !== currentUserId ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={pending}
                    onClick={() => run(() => removeGroupMemberAction(conversationId, member.user_id))}
                    aria-label={t("removeMember", { name: memberName })}
                  >
                    <UserMinus aria-hidden />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>

        {isAdmin ? (
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">{t("addMembers")}</h3>
            <ContactPicker
              multiple
              selected={selected}
              excludeIds={members.map((m) => m.user_id)}
              onToggle={(contact) =>
                setSelected((current) => (current.some((c) => c.id === contact.id) ? current.filter((c) => c.id !== contact.id) : [...current, contact]))
              }
            />
            <div className="mt-3 flex justify-end">
              <Button
                disabled={selected.length === 0}
                loading={pending}
                onClick={() => run(() => addGroupMembersAction(conversationId, selected.map((s) => s.id)), () => setSelected([]))}
              >
                {t("addSelected", { count: selected.length })}
              </Button>
            </div>
          </div>
        ) : null}
      </Overlay.DialogContent>
    </Overlay.Dialog>
  );
}
