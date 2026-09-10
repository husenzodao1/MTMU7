import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "МТМУ №7 — Мактаби Таълимии Миёнаи Умумии №7",
    short_name: "МТМУ №7",
    description: "Мактаби Таълимии Миёнаи Умумии №7 ба номи Мирзие Ҳабибов",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    orientation: "any",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/school.png",
        sizes: "1254x1254",
        type: "image/png",
      },
    ],
  };
}
