import { ALLERGENS } from "./guides/allergens.ts";

/**
 * Every public, indexable page: the sitemap, the metadata of each page, internal links
 * and the SEO tests all read this one list, so a page cannot exist in one place and be
 * missing from another. Signed-in and transactional pages are NOT here on purpose.
 *
 * `updated` is the real date the content last changed (shown as "last reviewed" and in the
 * sitemap). Change it when you edit the page, not on every deploy.
 */
export type PageEntry = {
  path: string;
  /** Without the " · Fuuud" suffix the layout adds. */
  title: string;
  description: string;
  updated: string;
};

export const TITLE_SUFFIX = " · Fuuud";

export const HOME: PageEntry & { absoluteTitle: string } = {
  path: "/",
  title: "Fuuud",
  absoluteTitle: "Fuuud · A nutrition agent that remembers your health",
  description:
    "Fuuud is a nutrition agent for Nigerian food that remembers your allergies and conditions once, keeps them in a record you own, and checks every meal against them.",
  updated: "2026-10-07",
};

export const GUIDES_HOME: PageEntry = {
  path: "/guides",
  title: "Guides",
  description: "Plain guides on keeping health data private, connecting Fuuud to your AI apps, and eating safely with a food allergy in Nigeria.",
  updated: "2026-10-07",
};

export const PRIVATE_MEMORY: PageEntry = {
  path: "/guides/private-health-memory",
  title: "How Fuuud keeps your health memory private",
  description: "What Fuuud writes down, where it is stored, who can read it, and how to revoke a device or forget a fact. Written from how the app really works.",
  updated: "2026-10-07",
};

export const CONNECT: PageEntry = {
  path: "/guides/connect-claude-chatgpt-cursor",
  title: "Connect Fuuud to Claude, ChatGPT and Cursor",
  description: "Add your Fuuud memory to Claude, ChatGPT, Cursor, VS Code or Gemini CLI once, with one connector URL, and disconnect it any time.",
  updated: "2026-10-07",
};

export const ALLERGY_HUB: PageEntry = {
  path: "/guides/allergy-safe-nigerian-meals",
  title: "Allergy-safe Nigerian meals: a guide",
  description: "Where common allergens hide in everyday Nigerian food, what to ask a vendor, and how to tell Fuuud once so it never suggests them again.",
  updated: "2026-10-07",
};

export const PRIVACY: PageEntry = {
  path: "/privacy",
  title: "Privacy policy",
  description: "What Fuuud collects, where it goes, who processes it, and how to delete or take back what you share.",
  updated: "2026-10-07",
};

export const TERMS: PageEntry = {
  path: "/terms",
  title: "Terms of use",
  description: "The terms for using Fuuud, including that it gives food guidance and not medical advice.",
  updated: "2026-10-07",
};

export const allergenPath = (slug: string) => `${ALLERGY_HUB.path}/${slug}`;

export const ALLERGEN_PAGES: PageEntry[] = ALLERGENS.map((a) => ({
  path: allergenPath(a.slug),
  title: a.title,
  description: a.description,
  updated: a.updated,
}));

export const PAGES: PageEntry[] = [HOME, GUIDES_HOME, PRIVATE_MEMORY, CONNECT, ALLERGY_HUB, ...ALLERGEN_PAGES, PRIVACY, TERMS];

/** Routes that need a signed-in person or are transactional. Always noindex and disallowed in robots.txt. */
export const PRIVATE_ROUTES = ["/agent", "/calendar", "/settings", "/consultants", "/setup", "/signin", "/oauth", "/api"] as const;
