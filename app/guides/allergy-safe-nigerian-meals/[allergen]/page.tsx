import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import JsonLd from "@/components/json-ld";
import { ArticleHead, Body, CtaCard, Frame, MEDICAL_NOTE, Related } from "@/components/guides/frame";
import { ALLERGENS, allergenBySlug } from "@/lib/guides/allergens";
import { ALLERGEN_PAGES, ALLERGY_HUB, allergenPath } from "@/lib/pages";
import { faqLd, pageMetadata } from "@/lib/seo";

export const dynamicParams = false;
export function generateStaticParams() {
  return ALLERGENS.map((a) => ({ allergen: a.slug }));
}

const entryOf = (slug: string) => ALLERGEN_PAGES.find((p) => p.path === allergenPath(slug));

export async function generateMetadata({ params }: { params: Promise<{ allergen: string }> }): Promise<Metadata> {
  const { allergen } = await params;
  const entry = entryOf(allergen);
  return entry ? pageMetadata(entry) : {};
}

export default async function AllergenPage({ params }: { params: Promise<{ allergen: string }> }) {
  const { allergen: slug } = await params;
  const a = allergenBySlug(slug);
  const entry = entryOf(slug);
  if (!a || !entry) notFound();

  const others = ALLERGENS.filter((o) => o.slug !== a.slug);

  return (
    <Frame>
      <ArticleHead
        entry={entry}
        trail={[["Guides", "/guides"], ["Allergy-safe Nigerian meals", ALLERGY_HUB.path], [a.title.split(":")[0], entry.path]]}
        eyebrow="Allergy guide"
        heading={a.title}
        lede={a.intro}
      />
      <JsonLd data={faqLd(a.faq)} />

      <Body
        aside={
          <CtaCard
            body={`Tell Fuuud about your ${a.name} allergy once and it checks every meal it suggests against it, in every session.`}
          />
        }
      >
        <div className="km-prose">
          <h2>Where {a.name} often hides</h2>
          <p>These are common patterns, not guarantees. A particular cook or brand may do it differently, so treat each line as a reason to ask.</p>
          <ul>
            {a.hides.map((h) => (
              <li key={h.food}>
                <strong>{h.food}.</strong> {h.note}
              </li>
            ))}
          </ul>

          <h2>Safer starting points</h2>
          <ul>
            {a.safer.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>

          <h2>What to ask before you eat</h2>
          <p>Say that it is an allergy, not a preference. Then ask plainly:</p>
          <ul>
            {a.ask.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>

          <h2>Tell Fuuud once</h2>
          <p>
            In the chat, say it the way you would to a person: <em>&ldquo;{a.tellFuuud.say}&rdquo;</em>. Fuuud stores one dated line
            in your own encrypted record:
          </p>
          <pre><code>{a.tellFuuud.stored}</code></pre>
          <p>
            From then on every meal suggestion is checked against it, and a meal that conflicts is blocked, not just flagged. If you
            change your mind you can retract the fact in Settings. How the record is kept is explained in{" "}
            <Link href="/guides/private-health-memory">how Fuuud keeps your health memory private</Link>.
          </p>

          {MEDICAL_NOTE}

          <h2>Common questions</h2>
          {a.faq.map((f) => (
            <div key={f.q}>
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}
          {a.related.map((r) => (
            <p key={r}>{r}</p>
          ))}
        </div>
      </Body>

      <Related
        title="Other allergy guides"
        links={others.map((o) => ({ href: allergenPath(o.slug), label: o.title.split(":")[0], hint: o.description }))}
      />
    </Frame>
  );
}
