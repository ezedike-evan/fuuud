import type { MetadataRoute } from "next";
import { HOME } from "@/lib/pages";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fuuud",
    short_name: "Fuuud",
    description: HOME.description,
    start_url: "/agent",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    lang: "en-NG",
    categories: ["food", "health", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
