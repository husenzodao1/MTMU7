import "server-only";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import type { DownloadLabels } from "@/components/site/download-app";
import { isAppUserAgent } from "@/lib/native/app";
import { APP_PLATFORMS, platformOf, type AppPlatform } from "@/lib/native/downloads";

/**
 * What the download menu needs: its words, the visitor's own platform to put
 * first, and whether to offer it at all — inside the app there is nothing to
 * download.
 */
export async function getDownloadMenu(): Promise<{ offer: boolean; labels: DownloadLabels; recommended: AppPlatform | null }> {
  const t = await getTranslations("site");
  const userAgent = (await headers()).get("user-agent");
  return {
    offer: !isAppUserAgent(userAgent),
    recommended: platformOf(userAgent),
    labels: {
      button: t("download.button"),
      title: t("download.title"),
      subtitle: t("download.subtitle"),
      more: t("download.more"),
      platforms: Object.fromEntries(
        APP_PLATFORMS.map((p) => [p, { name: t(`download.platforms.${p}.name`), hint: t(`download.platforms.${p}.hint`) }])
      ) as DownloadLabels["platforms"],
    },
  };
}
