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
    start_url: "/dashboard",
    display: "standalone",
    // The app's own night blue behind the icon while it opens.
    background_color: "#17306d",
    theme_color: "#17306d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
