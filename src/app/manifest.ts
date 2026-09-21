import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";

/**
 * Installable shell for the portal. The name comes from the interface
 * catalogue, never from unapproved official identity text; there is no service
 * worker yet, so the app is installable but not offline-capable.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations("common");
  return {
    name: t("platformName"),
    short_name: t("platformShort"),
    description: t("platformDescription"),
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#1f4d8b",
    icons: [
      { src: "/icon.png", sizes: "any", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
