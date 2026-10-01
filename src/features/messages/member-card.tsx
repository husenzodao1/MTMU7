"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Award, BookOpen, GraduationCap, House, MessageCircle, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { startDirectConversationAction } from "@/features/messages/actions";
import type { Locale } from "@/lib/i18n/text";
import { getBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils/cn";

interface MemberCard {
  id: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  avatar_url: string | null;
  nickname: string | null;
  status: string;
  roles: Array<{ slug: string; name_tg: string; name_ru: string; name_en: string }>;
  class: string | null;
  subjects: Array<{ tg: string; ru: string; en: string }>;
  homeroom: string | null;
  /** A pupil's posts in their class: monitor, cleanliness committee… (00072). */
  positions?: string[];
}

/** What is already known before the card arrives: enough to draw it at once. */
export interface MemberCardSeed {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * Cards already opened, kept for the life of the tab. Opening the same
 * person twice in a conversation should not be two trips to the database.
 */
const cards = new Map<string, MemberCard | null>();

function useMemberCard(userId: string | null): { card: MemberCard | null; loading: boolean } {
  const [fetched, setFetched] = useState<{ userId: string; card: MemberCard | null } | null>(null);
  const known = userId !== null && cards.has(userId);

  useEffect(() => {
    if (!userId || known) return;
    let live = true;
    void getBrowserClient()
      .rpc("get_member_card", { p_user_id: userId })
      .then(({ data, error }) => {
        const card = error ? null : ((data as MemberCard | null) ?? null);
        if (!error) cards.set(userId, card);
        if (live) setFetched({ userId, card });
      });
    return () => {
      live = false;
    };
  }, [userId, known]);

  if (!userId) return { card: null, loading: false };
  if (known) return { card: cards.get(userId) ?? null, loading: false };
  if (fetched?.userId === userId) return { card: fetched.card, loading: false };
  return { card: null, loading: true };
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

/**
 * Who somebody is, from inside a conversation.
 *
 * Opened by tapping a name or a face. It draws at once from what the thread
 * already knows — the name and the photo — and fills in the rest (what they
 * do here, a pupil's class, a teacher's subjects) as soon as it arrives.
 */
export function MemberCardDialog({
  seed,
  onClose,
  canMessage,
  hideMessage,
}: {
  seed: MemberCardSeed | null;
  onClose: () => void;
  /** Starting a conversation needs the messaging permission. */
  canMessage: boolean;
  /** Already talking to this person one-to-one, here. */
  hideMessage?: boolean;
}) {
  const t = useTranslations("portal.messages.card");
  const tRoot = useTranslations();
  const locale = useLocale() as Locale;
  const toast = useToast();
  const [starting, startTransition] = useTransition();
  const { card, loading } = useMemberCard(seed?.userId ?? null);

  const name = card ? `${card.first_name} ${card.last_name}`.trim() : (seed?.name ?? "");
  const avatar = card?.avatar_url ?? seed?.avatarUrl ?? null;
  const localized = (entry: { tg: string; ru: string; en: string }) => entry[locale] || entry.tg;
  const roles = (card?.roles ?? []).map((r) => localized({ tg: r.name_tg, ru: r.name_ru, en: r.name_en }));
  const subjects = (card?.subjects ?? []).map(localized);

  const facts: Array<{ icon: typeof BookOpen; label: string; value: string }> = [];
  if (card?.class) facts.push({ icon: GraduationCap, label: t("class"), value: card.class });
  if (card?.homeroom) facts.push({ icon: House, label: t("homeroom"), value: card.homeroom });
  if (card?.positions?.length) {
    facts.push({
      icon: Award,
      label: tRoot("accounts.sections.positions"),
      value: card.positions.map((p) => (tRoot.has(`accounts.positions.${p}`) ? tRoot(`accounts.positions.${p}`) : p)).join(" · "),
    });
  }
  if (subjects.length > 0) facts.push({ icon: BookOpen, label: t("subjects"), value: subjects.join(" · ") });

  return (
    <DialogPrimitive.Root open={seed !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/45 backdrop-blur-[2px] data-[state=open]:animate-fade" />
        <DialogPrimitive.Content
          className="member-card fixed left-1/2 top-1/2 z-50 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[1.75rem] bg-surface shadow-overlay focus:outline-none data-[state=open]:animate-fade"
          aria-describedby={undefined}
        >
          <div className="member-card-cover relative h-28">
            <DialogPrimitive.Close
              className="absolute end-3 top-3 inline-flex size-8 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur-sm transition-colors hover:bg-black/35"
              aria-label={tRoot("common.close")}
            >
              <X className="size-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          {/* Positioned, so it paints over the band it rises out of. */}
          <div className="relative -mt-14 flex flex-col items-center px-6 pb-6 text-center">
            <div className="member-card-ring rounded-full p-1">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- a member's photo from storage, drawn at one fixed size
                <img src={avatar} alt="" className="size-24 rounded-full bg-surface object-cover ring-4 ring-surface" />
              ) : (
                <span className="member-card-initials inline-flex size-24 items-center justify-center rounded-full text-3xl font-semibold ring-4 ring-surface" aria-hidden>
                  {seed ? initials(name) : null}
                </span>
              )}
            </div>

            <DialogPrimitive.Title className="mt-3 text-xl font-semibold leading-tight text-ink">{name}</DialogPrimitive.Title>
            {card?.nickname ? <p className="mt-0.5 text-sm font-medium text-brand-text">@{card.nickname}</p> : null}

            <div className="mt-3 flex min-h-7 flex-wrap justify-center gap-1.5">
              {loading ? (
                <>
                  <span className="h-7 w-20 animate-pulse rounded-full bg-surface-muted" />
                  <span className="h-7 w-16 animate-pulse rounded-full bg-surface-muted" />
                </>
              ) : (
                <>
                  {roles.map((role) => (
                    <span key={role} className="member-card-chip rounded-full px-3 py-1 text-xs font-semibold">
                      {role}
                    </span>
                  ))}
                  {card?.status === "graduated" ? (
                    <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-ink-secondary">{t("graduated")}</span>
                  ) : null}
                </>
              )}
            </div>

            {facts.length > 0 ? (
              <dl className="mt-5 w-full divide-y divide-line overflow-hidden rounded-2xl bg-surface-muted/60 text-start">
                {facts.map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-3 px-4 py-3">
                    <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-brand-text shadow-xs">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <dt className="text-[0.6875rem] font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
                      <dd className="text-sm font-medium text-ink">{value}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            ) : null}

            {!loading && seed && !card ? <p className="mt-4 text-sm text-ink-muted">{t("unavailable")}</p> : null}

            <div className={cn("mt-6 grid w-full gap-2", canMessage && !hideMessage && card ? "grid-cols-2" : "grid-cols-1")}>
              {canMessage && !hideMessage && card ? (
                <button
                  type="button"
                  disabled={starting}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await startDirectConversationAction(card.id);
                      if (result && !result.ok) toast("danger", tRoot(result.message));
                    })
                  }
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-solid px-4 text-sm font-semibold text-brand-on-solid shadow-sm transition-[transform,background-color] hover:bg-brand-solid-hover active:scale-[0.98] disabled:opacity-60"
                >
                  <MessageCircle className={cn("size-4", starting && "animate-pulse")} aria-hidden />
                  {t("write")}
                </button>
              ) : null}
              {seed ? (
                <Link
                  href={`/profile/${seed.userId}`}
                  onClick={onClose}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-surface-muted px-4 text-sm font-semibold text-ink transition-[transform,background-color] hover:bg-line active:scale-[0.98]"
                >
                  <UserRound className="size-4" aria-hidden />
                  {t("profile")}
                </Link>
              ) : null}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
