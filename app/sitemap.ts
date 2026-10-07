import type { MetadataRoute } from "next";
import { PAGES } from "@/lib/pages";
import { siteUrl } from "@/lib/seo";

// lastModified is the page's real content date from lib/pages.ts, not the deploy time.
export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((p) => ({ url: `${siteUrl()}${p.path}`, lastModified: p.updated }));
}
