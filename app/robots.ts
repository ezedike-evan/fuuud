import type { MetadataRoute } from "next";
import { PRIVATE_ROUTES } from "@/lib/pages";
import { siteUrl } from "@/lib/seo";

/**
 * Public pages are open to every crawler, including AI search bots; the signed-in and
 * transactional routes are not. /.well-known is deliberately NOT blocked: OAuth clients
 * fetch it. Pages also carry noindex themselves, because robots.txt only stops crawling.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...PRIVATE_ROUTES] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
