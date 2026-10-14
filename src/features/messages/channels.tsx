"use client";

import { Megaphone, Search } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form-controls";
import * as Overlay from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { createChannelAction, joinChannelAction, listChannelsAction, type ChannelSummary } from "@/features/messages/actions";

/**
 * The school's channels: one dialog to find a channel and follow it, or to
 * open one's own. A channel is a conversation only its owner writes in
 * (00094); following it puts it in the list with everything else, muting and
 * leaving work as they do for a group.
 */
export function ChannelsDialog({
  open,
  onOpenChange,
  canCreate,
  startWith = "find",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canCreate: boolean;
  startWith?: "find" | "create";
}) {
  const t = useTranslations("portal.messages.channel");
  const tRoot = useTranslations();
  const toast = useToast();
  const [mode, setMode] = useState<"find" | "create">(startWith);
  const [query, setQuery] = useState("");
  const [channels, setChannels] = useState<ChannelSummary[] | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, startTransition] = useTransition();
  const [joining, setJoining] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setMode(startWith);
  }

  // Asked as the words settle, a quarter of a second after the last key.
  useEffect(() => {
    if (!open || mode !== "find") return;
    let live = true;
    const timer = window.setTimeout(() => {
      void listChannelsAction(query).then((result) => {
        if (!live) return;
        if (result.ok) setChannels(result.data ?? []);
        else setChannels([]);
      });
    }, query ? 250 : 0);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [open, mode, query]);

  const create = () =>
    startTransition(async () => {
      const result = await createChannelAction(name, description);
      if (result && !result.ok) toast("danger", tRoot(result.message));
    });

  const follow = (id: string) => {
    setJoining(id);
    startTransition(async () => {
      const result = await joinChannelAction(id);
      setJoining(null);
      if (result && !result.ok) toast("danger", tRoot(result.message));
      else onOpenChange(false);
    });
  };

  return (
    <Overlay.Dialog open={open} onOpenChange={onOpenChange}>
      <Overlay.DialogContent title={mode === "create" ? t("new") : t("title")} closeLabel={tRoot("common.close")}>
        {canCreate ? (
          <div role="tablist" aria-label={t("title")} className="msg-segment mb-4">
            {(["find", "create"] as const).map((value) => (
              <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => setMode(value)}>
                {value === "find" ? t("find") : t("new")}
              </button>
            ))}
          </div>
        ) : null}

        {mode === "create" ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              create();
            }}
          >
            <div className="flex items-center gap-3">
              <span className="msg-avatar-channel inline-flex size-12 shrink-0 items-center justify-center rounded-full" aria-hidden>
                <Megaphone className="size-5" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <label htmlFor="channel-name" className="mb-1 block text-xs font-medium text-ink-muted">
                  {t("name")}
                </label>
                <Input id="channel-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus />
              </div>
            </div>
            <div>
              <label htmlFor="channel-description" className="mb-1 block text-xs font-medium text-ink-muted">
                {t("description")}
              </label>
              <Textarea id="channel-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} />
              <p className="mt-1.5 text-xs text-ink-muted">{t("createHint")}</p>
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={pending} disabled={!name.trim()}>
                {t("create")}
              </Button>
            </div>
          </form>
        ) : (
          <div>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search")}
                aria-label={t("search")}
                className="msg-search-input"
              />
            </div>
            {channels === null ? (
              <p className="py-6 text-center text-sm text-ink-muted">{tRoot("common.loading")}</p>
            ) : channels.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-muted">{query ? t("noMatches") : t("none")}</p>
            ) : (
              <ul className="-mx-2 max-h-[55dvh] overflow-y-auto">
                {channels.map((channel) => {
                  const owner = `${channel.owner_first_name ?? ""} ${channel.owner_last_name ?? ""}`.trim();
                  return (
                    <li key={channel.id} className="flex items-center gap-3 rounded-lg px-2 py-2.5">
                      <span className="msg-avatar-channel inline-flex size-11 shrink-0 items-center justify-center rounded-full" aria-hidden>
                        <Megaphone className="size-[1.125rem]" strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9375rem] font-semibold text-ink">{channel.name}</span>
                        <span className="block truncate text-xs text-ink-muted">
                          {channel.description || owner}
                          {" · "}
                          {t("followers", { count: channel.followers })}
                        </span>
                      </span>
                      {channel.is_member ? (
                        <Link href={`/messages/${channel.id}`} onClick={() => onOpenChange(false)} className="msg-pill-button" data-tone="quiet">
                          {t("open")}
                        </Link>
                      ) : (
                        <button type="button" className="msg-pill-button" onClick={() => follow(channel.id)} disabled={pending}>
                          {joining === channel.id ? "…" : t("follow")}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </Overlay.DialogContent>
    </Overlay.Dialog>
  );
}
