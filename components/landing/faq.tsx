import { Plus } from "lucide-react";
import Eyebrow from "./eyebrow";
import BlurIn from "./blur-in";

/**
 * Native <details> rather than a JS accordion: it opens with no hydration, it
 * is findable with the browser's own search, and it works if the bundle never
 * arrives. The only JS involved is the icon rotating.
 */
const QA = [
  {
    q: "Is this medical advice?",
    a: "No. It does not diagnose and it is not a doctor. When a condition is involved it says so and points you to a practitioner — and the practitioner list is ranked by what it recalled, so it can be specific about who.",
  },
  {
    q: "What exactly gets written down?",
    a: "Six things you assert about yourself: a medical condition, an allergy or intolerance, an explicit “I have no allergies”, a suggestion you refused with a reason, a symptom after eating, and a standing dislike such as “I don’t like a lot of vegetables”. Cravings, small talk, hypotheticals and its own suggestions are never stored. Most turns store nothing at all.",
  },
  {
    q: "What if I say something I don't want kept?",
    a: "Say “don't save that”, or anything meaning the same, and nothing from that turn is written — including a real condition mentioned inside it. That is enforced before the write, in code, not left to the model's judgement.",
  },
  {
    q: "Can I take a fact back later?",
    a: "Yes, from the settings page or by asking. Retracting writes a record that outranks the fact, so nothing can recall it again. It is not deletion: the encrypted entry stays on Walrus until its storage period expires, and we say that everywhere rather than in a footnote.",
  },
  {
    q: "Do I need a wallet?",
    a: "No. Signing in with Google creates a Sui address for you through zkLogin. Nothing to install, no gas to pay, no seed phrase to lose — and the address is yours, not ours.",
  },
  {
    q: "What happens if this app shuts down?",
    a: "Your record is unaffected. It lives on Walrus under your address, not in our database, and any other agent you authorise can read it over MCP. That is the point of building it this way.",
  },
];

export default function Faq() {
  return (
    <section id="faq" className="border-b border-line-soft">
      <div className="mx-auto max-w-[1280px] px-6 py-20 md:px-12">
        <Eyebrow>Questions</Eyebrow>

        <BlurIn
          text="The things worth asking a health app."
          className="mt-6 max-w-[24ch] font-display font-medium text-[clamp(32px,4.4vw,44px)] leading-[1.1] tracking-[-0.03em]"
        />

        <div className="mt-11 overflow-hidden rounded-[10px] border border-line">
          {QA.map((item) => (
            <details key={item.q} className="group border-b border-line-soft last:border-b-0">
              <summary className="flex cursor-pointer list-none items-center gap-5 px-5 py-[18px] transition-colors hover:bg-surface [&::-webkit-details-marker]:hidden">
                <span className="flex-1 text-[15px] font-medium">{item.q}</span>
                <Plus
                  aria-hidden
                  className="size-4 shrink-0 text-ink-faint transition-transform duration-300 group-open:rotate-45"
                />
              </summary>
              <p className="max-w-[70ch] px-5 pb-[22px] text-[13.5px] leading-[1.66] text-ink-muted">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
