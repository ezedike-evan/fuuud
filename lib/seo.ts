import type { Metadata } from "next";
import { appUrl } from "./app-url.ts";
import { PAGES, TITLE_SUFFIX, type PageEntry } from "./pages.ts";

export const SITE = {
  name: "Fuuud",
  tagline: "A nutrition agent that remembers your health",
  description:
    "Tell it your allergies and conditions once. Fuuud keeps them in a record you own and checks every Nigerian meal it suggests against them.",
  locale: "en_NG",
} as const;

/**
 * The public origin for canonical links, the sitemap and social cards. It must never break
 * `next build`, so a missing or invalid APP_URL falls back instead of throwing (appUrl()
 * is strict on purpose because OAuth depends on it; SEO should degrade, not fail).
 */
export function siteUrl(): string {
  try {
    return appUrl();
  } catch {
    return "https://fuuud.site";
  }
}

export const absolute = (path: string) => `${siteUrl()}${path === "/" ? "" : path}`;

/** Serializes JSON-LD for a <script> tag. `<` is escaped so no value can close the tag early. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(new RegExp("\\u2028", "g"), "\\u2028").replace(new RegExp("\\u2029", "g"), "\\u2029");
}

export const NOINDEX: Metadata = { robots: { index: false, follow: false } };

/** Metadata for a registered public page. One source: lib/pages.ts. */
export function pageMetadata(entry: PageEntry, opts: { type?: "website" | "article"; image?: string } = {}): Metadata {
  const type = opts.type ?? "article";
  // A page that sets openGraph replaces the parent's, so the image is stated here. Guides have
  // their own opengraph-image file; everything else uses the site card.
  const image = opts.image ?? `${entry.path === "/" ? "" : entry.path}/opengraph-image`;
  return {
    title: entry.title,
    description: entry.description,
    alternates: { canonical: entry.path },
    openGraph: {
      type,
      url: entry.path,
      title: `${entry.title}${TITLE_SUFFIX}`,
      description: entry.description,
      siteName: SITE.name,
      locale: SITE.locale,
      images: [{ url: image, width: 1200, height: 630 }],
      ...(type === "article" ? { modifiedTime: entry.updated, publishedTime: entry.updated } : {}),
    },
    twitter: { card: "summary_large_image", title: `${entry.title}${TITLE_SUFFIX}`, description: entry.description, images: [image] },
  };
}

export const entryFor = (path: string) => PAGES.find((p) => p.path === path);

/** schema.org Article for a guide, with the Organization as author and publisher. */
export function articleLd(entry: PageEntry) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: entry.title,
    description: entry.description,
    mainEntityOfPage: absolute(entry.path),
    url: absolute(entry.path),
    inLanguage: "en-NG",
    datePublished: entry.updated,
    dateModified: entry.updated,
    image: absolute(`${entry.path}/opengraph-image`),
    author: { "@type": "Organization", name: SITE.name, url: siteUrl() },
    publisher: { "@type": "Organization", name: SITE.name, logo: { "@type": "ImageObject", url: absolute("/icon-512.png") } },
  };
}

/** BreadcrumbList from [name, path] pairs, home first. */
export function breadcrumbLd(trail: [string, string][]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [["Home", "/"] as [string, string], ...trail].map(([name, path], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: absolute(path),
    })),
  };
}

export function faqLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
}
