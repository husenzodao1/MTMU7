"use client";

import { SquarePen, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import * as Overlay from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { ContactPicker } from "@/features/messages/contact-picker";
import { createGroupAction, startDirectConversationAction } from "@/features/messages/actions";
import type { ContactResult } from "@/features/messages/types";
import { cn } from "@/lib/utils/cn";

export function NewConversationButton({ canCreateGroup, className }: { canCreateGroup: boolean; className?: string }) {
  const t = useTranslations("portal.messages");
  const tRoot = useTranslations();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [selected, setSelected] = useState<ContactResult[]>([]);
  const [groupName, setGroupName] = useState("");
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setMode("direct");
    setSelected([]);
    setGroupName("");
  };

  const pickDirect = (contact: ContactResult) => {
    startTransition(async () => {
      const result = await startDirectConversationAction(contact.id);
      if (result && !result.ok) toast("danger", tRoot(result.message));
    });
  };

  const toggleMember = (contact: ContactResult) => {
    setSelected((current) => (current.some((c) => c.id === contact.id) ? current.filter((c) => c.id !== contact.id) : [...current, contact]));
  };

  const createGroup = () => {
    startTransition(async () => {
      const result = await createGroupAction(groupName, selected.map((s) => s.id));
      if (result && !result.ok) toast("danger", tRoot(result.message));
    });
  };

  return (
    <Overlay.Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Overlay.DialogTrigger asChild>
        <Button className={className}>
          <SquarePen aria-hidden />
          {t("new")}
        </Button>
      </Overlay.DialogTrigger>
      <Overlay.DialogContent title={t("new")} closeLabel={tRoot("common.close")}>
        {canCreateGroup ? (
          <div role="tablist" aria-label={t("new")} className="mb-4 grid grid-cols-2 rounded-md border border-line p-0.5">
            {(["direct", "group"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => setMode(value)}
                className={cn("rounded px-3 py-1.5 text-sm", mode === value ? "bg-brand-50 font-medium text-brand-800" : "text-ink-secondary hover:text-ink")}
              >
                {t(`mode.${value}`)}
              </button>
            ))}
          </div>
        ) : null}

        {mode === "group" ? (
          <div className="mb-4 space-y-3">
            <div>
              <label htmlFor="group-name" className="mb-1.5 block text-sm font-medium text-ink">
                {t("groupName")}
              </label>
              <Input id="group-name" value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={100} />
            </div>
            {selected.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5" aria-label={t("selectedMembers")}>
                {selected.map((member) => (
                  <li key={member.id} className="inline-flex items-center gap-1 rounded-md bg-surface-muted py-1 pl-2 pr-1 text-sm">
                    {member.last_name} {member.first_name}
                    <button type="button" onClick={() => toggleMember(member)} className="rounded p-0.5 text-ink-muted hover:text-ink" aria-label={t("removeSelected", { name: `${member.last_name} ${member.first_name}` })}>
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <ContactPicker multiple={mode === "group"} selected={selected} onToggle={mode === "group" ? toggleMember : pickDirect} />

        {mode === "group" ? (
          <div className="mt-4 flex justify-end">
            <Button onClick={createGroup} loading={pending} disabled={!groupName.trim() || selected.length === 0}>
              {t("createGroup", { count: selected.length })}
            </Button>
          </div>
        ) : pending ? (
          <p className="mt-3 text-sm text-ink-muted" aria-live="polite">{tRoot("common.loading")}</p>
        ) : null}
      </Overlay.DialogContent>
    </Overlay.Dialog>
  );
}
