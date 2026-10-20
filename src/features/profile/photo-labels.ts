import "server-only";
import { getTranslations } from "next-intl/server";
import type { AvatarEditorLabels } from "@/features/profile/avatar-editor";

/** The photo editor's words (avatar-editor.tsx), for the top of Profile and Settings. */
export async function photoLabels(): Promise<AvatarEditorLabels> {
  const t = await getTranslations("portal.profile");
  return {
    change: t("photoChange"),
    choose: t("photoChoose"),
    remove: t("photoRemove"),
    cropTitle: t("photoCropTitle"),
    cropHint: t("photoCropHint"),
    zoomIn: t("photoZoomIn"),
    zoomOut: t("photoZoomOut"),
    save: t("photoSave"),
    cancel: t("photoCancel"),
    unreadable: t("photoUnreadable"),
    failed: t("photoFailed"),
  };
}
