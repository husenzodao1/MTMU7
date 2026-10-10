"use client";

import { Eye, Heart, MessageCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { ActionForm } from "@/components/ui/action-form";
import { toggleNewsLikeAction } from "@/features/news/reactions";
import { pickName, type Locale } from "@/lib/i18n/text";
import { cn } from "@/lib/utils/cn";

export interface RoleName {
  slug: string;
  name_tg: string;
  name_ru: string | null;
  name_en: string | null;
}

export interface Engagement {
  views: number;
  likes: number;
  comments: number;
  liked: boolean;
}

/**
 * Who published this, and in what capacity. The standing is the point — a
 * notice from the director carries differently from one by anyone else — so it
 * sits at the corner of the item rather than inside the prose.
 */
export function Byline({ name, role }: { name: string; role: RoleName | null }) {
  const locale = useLocale() as Locale;
  const roleName = role ? pickName(role, locale) : null;
  return (
    <p className="shrink-0 text-right text-xs leading-tight text-ink-muted">
      {roleName ? <span className="block font-medium text-ink-secondary">{roleName}</span> : null}
      <span className="block">{name}</span>
    </p>
  );
}

function LikeButton({ liked, likes, label }: { liked: boolean; likes: number; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-pressed={liked}
      title={label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors disabled:opacity-60",
        liked ? "text-brand-text" : "text-ink-muted hover:text-ink-secondary"
      )}
    >
      <Heart className={cn("size-3.5", liked && "fill-current")} aria-hidden />
      <span className="tabular">{likes}</span>
      <span className="sr-only">{label}</span>
    </button>
  );
}

/**
 * Readers, support and replies for one article. Counts are plain numbers with
 * a single icon each; only the like is interactive.
 */
export function ReactionBar({
  articleId,
  engagement,
  className,
}: {
  articleId: string;
  engagement: Engagement;
  className?: string;
}) {
  const t = useTranslations("portal.news");

  return (
    <div className={cn("flex items-center gap-3 text-xs text-ink-muted", className)}>
      <span className="inline-flex items-center gap-1.5" title={t("views")}>
        <Eye className="size-3.5" aria-hidden />
        <span className="tabular">{engagement.views}</span>
        <span className="sr-only">{t("views")}</span>
      </span>

      <ActionForm action={toggleNewsLikeAction} className="contents">
        <input type="hidden" name="articleId" value={articleId} />
        <LikeButton liked={engagement.liked} likes={engagement.likes} label={engagement.liked ? t("unlike") : t("like")} />
      </ActionForm>

      <span className="inline-flex items-center gap-1.5" title={t("comments")}>
        <MessageCircle className="size-3.5" aria-hidden />
        <span className="tabular">{engagement.comments}</span>
        <span className="sr-only">{t("comments")}</span>
      </span>
    </div>
  );
}
