import Link from "next/link";
import type { Metadata } from "next";
import { ArticleHead, Body, CtaCard, Frame, MEDICAL_NOTE, Related } from "@/components/guides/frame";
import { ALLERGENS } from "@/lib/guides/allergens";
import { ALLERGY_HUB, GUIDES_HOME, allergenPath } from "@/lib/pages";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(ALLERGY_HUB);

export default function AllergyHub() {
  return (
    <Frame>
      <ArticleHead
        entry={ALLERGY_HUB}
        trail={[["Guides", GUIDES_HOME.path], ["Allergy-safe Nigerian meals", ALLERGY_HUB.path]]}
        eyebrow="Guide"
        heading="Allergy-safe Nigerian meals"
        lede="Many allergens are in Nigerian food as a seasoning, a thickener or a glaze, not as the thing on the plate. These guides show where they usually hide and what to ask."
      />
      <Body aside={<CtaCard body="Tell Fuuud your allergy once. It checks every Nigerian meal it suggests against it." />}>
        <div className="km-prose">
          <h2>Pick your allergen</h2>
          <ul>
            {ALLERGENS.map((a) => (
              <li key={a.slug}>
                <Link href={allergenPath(a.slug)}>{a.title}</Link>: {a.description}
              </li>
            ))}
          </ul>

          <h2>Why Nigerian food needs its own guide</h2>
          <p>
            Most allergy advice is written around packaged food and Western menus. Nigerian cooking leans on ground seasonings, shared
            frying oil, street vendors and recipes that vary house to house. Crayfish goes into the soup base, yaji goes onto the suya,
            and an egg may be folded into moi moi without anyone mentioning it. None of that is on a label.
          </p>
          <p>
            The habit that works is the same in every case: say it is an allergy, ask what is in the seasoning and the oil, and check
            how the food is cooked and served.
          </p>

          <h2>Use it with Fuuud</h2>
          <p>
            Fuuud remembers your allergies and conditions once, in a record you own, and checks each meal against them. You do not
            repeat yourself and you do not rely on remembering to ask. See{" "}
            <Link href="/guides/private-health-memory">how the record is kept private</Link>, or{" "}
            <Link href="/guides/connect-claude-chatgpt-cursor">connect it to your AI app</Link>.
          </p>
          {MEDICAL_NOTE}
        </div>
      </Body>
      <Related
        links={[
          { href: "/guides/private-health-memory", label: "How Fuuud keeps your health memory private", hint: "What is stored, where, and how to take it back." },
          { href: "/guides/connect-claude-chatgpt-cursor", label: "Connect Fuuud to your AI app", hint: "One connector for Claude, ChatGPT, Cursor and more." },
        ]}
      />
    </Frame>
  );
}
