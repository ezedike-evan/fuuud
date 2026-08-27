import {
  Clock,
  Filter,
  Plug,
  Search,
  ShieldAlert,
  Undo2,
} from "lucide-react";
import Eyebrow from "./eyebrow";
import BlurIn from "./blur-in";
import Reveal from "./reveal";

/**
 * Six things it does, each one a rule that exists in the code rather than a
 * capability we hope the model has. That is the whole distinction the project
 * is arguing for, so the copy names the mechanism every time.
 */
const FEATURES = [
  {
    icon: Search,
    title: "Recalls before it speaks",
    body:
      "Every turn that touches food starts with a search of your own record, filtered by relevance. Nothing is answered from what it happens to remember from earlier in the chat.",
  },
  {
    icon: Filter,
    title: "A write gate, not a diary",
    body:
      "Six things get written: a condition, an allergy, an explicit “no allergies”, a refusal with a reason, a symptom after eating, a standing dislike. Cravings, small talk and its own suggestions never do. Most turns store nothing.",
  },
  {
    icon: ShieldAlert,
    title: "The safety check isn't the model's job",
    body:
      "Ingredients are matched against your recorded allergens after the model speaks. It knows kuli kuli is groundnut, semovita is gluten, and that garden egg is not an egg.",
  },
  {
    icon: Clock,
    title: "Newer facts win, out loud",
    body:
      "Entries are dated and never overwritten. When two disagree, the newer one is used and the agent says which one it is acting on rather than quietly averaging them.",
  },
  {
    icon: Undo2,
    title: "Taking something back is real",
    body:
      "Retracting a fact writes a record that outranks it, so nothing reads it again — not this app, not any other agent holding your key. It is out of reach, and we don't call that deleted.",
  },
  {
    icon: Plug,
    title: "The same record, from any agent",
    body:
      "An MCP server exposes the identical contract to Claude Code, Cursor, or anything else you use. A fact learned in one is enforced by the other, because the record isn't inside either.",
  },
];

export default function Features() {
  return (
    <section id="what" className="border-b border-line-soft">
      <div className="mx-auto max-w-[1280px] px-6 py-20 md:px-12">
        <Eyebrow>What it does</Eyebrow>

        <BlurIn
          text="Rules in the code, not promises in a prompt."
          className="mt-6 max-w-[26ch] font-display font-medium text-[clamp(32px,4.4vw,44px)] leading-[1.1] tracking-[-0.03em]"
        />

        <p className="mt-5 max-w-[56ch] text-[15px] leading-[1.66] text-ink-muted">
          A model that is told to be careful is careful most of the time. Everything below is
          enforced whether it cooperates or not.
        </p>

        <div className="mt-11 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <Reveal key={f.title} delay={(i % 3) * 0.07}>
                <div className="card h-full p-6">
                  <span className="inline-flex rounded-[10px] border border-line bg-recess p-2.5 text-accent">
                    <Icon className="size-[18px]" />
                  </span>
                  <h3 className="mb-2 mt-4 text-base font-medium">{f.title}</h3>
                  <p className="text-[13.5px] leading-[1.62] text-ink-muted">{f.body}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
