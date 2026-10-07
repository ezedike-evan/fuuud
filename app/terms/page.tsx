import Link from "next/link";
import type { Metadata } from "next";
import { ArticleHead, Body, Callout, Frame } from "@/components/guides/frame";
import { ContactLine } from "@/components/guides/legal";
import { PRIVACY, TERMS } from "@/lib/pages";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(TERMS, { image: "/opengraph-image" });

export default function Terms() {
  return (
    <Frame>
      <ArticleHead
        entry={TERMS}
        trail={[["Terms of use", TERMS.path]]}
        eyebrow="Legal"
        heading="Terms of use"
        lede="The short version: Fuuud is a food guide that remembers what you tell it. It is not a doctor."
        article={false}
      />
      <Body>
        <div className="km-prose">
          <Callout title="Not medical advice" tone="warn">
            <p>
              Fuuud does not diagnose, treat or replace a clinician. It can be wrong. If you have a diagnosed allergy or condition, follow
              your clinician&apos;s advice and read labels, whatever Fuuud says.
            </p>
          </Callout>

          <h2>Using Fuuud</h2>
          <p>
            You may use Fuuud for your own food and nutrition decisions. Do not misuse the service, attempt to access other people&apos;s
            records, or overload it. You are responsible for what you tell it and for the apps you connect to your memory.
          </p>

          <h2>Your record</h2>
          <p>
            The facts you save belong to you, in a memory account owned by your own address. You can retract facts and revoke access at
            any time, as described in the <Link href={PRIVACY.path}>privacy policy</Link>. Retracting does not erase an encrypted entry from
            Walrus before its storage period ends.
          </p>

          <h2>Availability</h2>
          <p>
            Fuuud is in beta and depends on third-party services including Walrus, Sui, an AI model provider and Telegram. It may be slow,
            change, or be unavailable. If it cannot read your record it says so and does not guess about your conditions.
          </p>

          <h2>No warranty and liability</h2>
          <p>
            The service is provided as it is, without warranties. To the extent the law allows, we are not liable for harm arising from
            food choices made using it. Nothing here limits liability that cannot be limited by law.
          </p>

          <h2>Changes</h2>
          <p>We may update these terms and will change the date above when we do.</p>
          <ContactLine />
        </div>
      </Body>
    </Frame>
  );
}
