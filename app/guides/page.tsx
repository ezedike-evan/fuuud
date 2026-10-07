import type { Metadata } from "next";
import { ArticleHead, Frame, Related } from "@/components/guides/frame";
import { ALLERGEN_PAGES, ALLERGY_HUB, CONNECT, GUIDES_HOME, PRIVATE_MEMORY } from "@/lib/pages";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(GUIDES_HOME, { type: "website" });

export default function GuidesIndex() {
  return (
    <Frame>
      <ArticleHead
        entry={GUIDES_HOME}
        trail={[["Guides", GUIDES_HOME.path]]}
        eyebrow="Guides"
        heading="Plain guides for eating safely with a memory you own"
        lede="How the record is kept private, how to bring it into the AI apps you already use, and where allergens hide in everyday Nigerian food."
        article={false}
      />
      <Related
        title="Start here"
        links={[
          { href: PRIVATE_MEMORY.path, label: PRIVATE_MEMORY.title, hint: PRIVATE_MEMORY.description },
          { href: CONNECT.path, label: CONNECT.title, hint: CONNECT.description },
          { href: ALLERGY_HUB.path, label: ALLERGY_HUB.title, hint: ALLERGY_HUB.description },
        ]}
      />
      <Related
        title="Allergy guides"
        links={ALLERGEN_PAGES.map((p) => ({ href: p.path, label: p.title, hint: p.description }))}
      />
    </Frame>
  );
}
