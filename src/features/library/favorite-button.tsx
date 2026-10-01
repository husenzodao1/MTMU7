"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { toggleFavoriteAction } from "@/features/library/actions";

export function FavoriteButton({ itemId, isFavorite }: { itemId: string; isFavorite: boolean }) {
  const t = useTranslations("portal.library");
  return (
    <ActionForm action={toggleFavoriteAction}>
      <input type="hidden" name="itemId" value={itemId} />
      <SubmitButton variant="secondary" aria-pressed={isFavorite}>
        <Star aria-hidden className={isFavorite ? "fill-current text-warning-600" : undefined} />
        {isFavorite ? t("removeFavorite") : t("addFavorite")}
      </SubmitButton>
    </ActionForm>
  );
}
